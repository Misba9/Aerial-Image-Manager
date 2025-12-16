const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

// Set Chromium flags early to prevent GPU/cache errors
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('disable-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');

// Silence harmless DevTools autofill warnings
process.on('unhandledRejection', (reason) => {
  try {
    if (typeof reason?.message === 'string' && reason.message.includes('Autofill.enable')) {
      return;
    }
  } catch (_e) {
    // ignore
  }
  // Fallback log for other unhandled rejections
  // eslint-disable-next-line no-console
  console.error(reason);
});

const SCRIPT_MAP = {
  'geotag:extract': 'geotagging/extract_gps.py',
  'geotag:write': 'geotagging/write_gps.py',
  'geotag:auto-scan': 'geotagging/extract_gps.py',
  'renamer:preview': 'flightRenamer/rename_images.py',
  'renamer:execute': 'flightRenamer/rename_images.py',
  'renamer:undo': 'flightRenamer/rename_images.py',
  'map:extract': 'mapOrganizer/extract_gps.py',
  'map:group': 'mapOrganizer/group_images.py',
  'map:copy-selected': 'mapOrganizer/copy_selected.py',
  'map:load': 'mapOrganizer/map_loader.py',
  'map:export-images': 'mapOrganizer/export_images.py'
};

const getPythonExecutable = () => {
  if (process.env.PYTHON_PATH && process.env.PYTHON_PATH.trim()) {
    return process.env.PYTHON_PATH.trim();
  }
  if (app.isPackaged) {
    // Expect bundled python executable alongside packaged resources.
    return path.join(process.resourcesPath, 'python', 'python.exe');
  }
  return 'python';
};

const resolveScriptPath = (relativeScript) => {
  const baseDir = app.isPackaged
    ? path.join(process.resourcesPath, 'python')
    : path.join(__dirname, '..', 'python');
  return path.join(baseDir, relativeScript);
};

const runPythonScript = (event, channel, relativeScript, payload = {}, progressChannelOverride) =>
  new Promise((resolve, reject) => {
    const scriptPath = resolveScriptPath(relativeScript);
    const pythonExe = getPythonExecutable();
    const args = [scriptPath, JSON.stringify(payload || {})];

    const child = spawn(pythonExe, args, {
      windowsHide: true,
      shell: false
    });

    let stdout = '';
    let stderr = '';
    const progressChannel = progressChannelOverride || `${channel}:progress`;

    child.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      const lines = text.split(/\r?\n/).filter(Boolean);
      lines.forEach((line) => {
        try {
          const parsed = JSON.parse(line);
          if (parsed && parsed.type === 'progress' && event?.sender) {
            event.sender.send(progressChannel, parsed);
          }
        } catch (_e) {
          // ignore non-JSON progress lines; final payload is handled on close
        }
      });
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to start Python script: ${err.message}`));
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Python script exited with code ${code}. Stderr: ${stderr || 'n/a'}`
          )
        );
        return;
      }

      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) {
        resolve({ success: true });
        return;
      }

      // Use the last JSON line as the final payload
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        try {
          const parsed = JSON.parse(lines[i]);
          resolve(parsed);
          return;
        } catch (_e) {
          continue;
        }
      }

      resolve({ success: true, output: lines.join('\n') });
    });
  });

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged, // Disable devtools in production
      // Disable GPU acceleration to prevent cache errors
      offscreen: false
    }
  });

  // Prevent DPI/zoom scaling in Electron (map alignment fix)
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1);

  // Ensure Windows compatibility
  if (process.platform === 'win32') {
    // Additional Windows-specific settings
    mainWindow.setBackgroundColor('#333333');
  }

  // Cache directory handled in app.whenReady()

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
};

const registerIpcHandlers = () => {
  let scanInFlight = false;

  const handleSelectFolderDialog = async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths.length) {
      return { path: null };
    }
    return { path: result.filePaths[0] };
  };

  ipcMain.handle('dialog:select-folder', handleSelectFolderDialog);
  ipcMain.handle('open-folder-dialog', handleSelectFolderDialog);

  ipcMain.handle('dialog:select-files', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'All Files', extensions: ['*'] }]
    });
    if (result.canceled || !result.filePaths.length) {
      return { files: [] };
    }
    return { files: result.filePaths };
  });

  ipcMain.handle('dialog:save-csv', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Save GPS CSV',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
      defaultPath: 'gps_export.csv'
    });
    if (result.canceled || !result.filePath) {
      return { path: null };
    }
    return { path: result.filePath };
  });

  ipcMain.handle('i18n:set-language', async (_event, payload) => {
    const locale = payload?.locale || 'en';
    return { ok: true, locale };
  });

  ipcMain.handle('open-folder', async (_event, payload) => {
    const { shell } = require('electron');
    const folderPath = payload?.path;
    
    if (!folderPath) {
      return { ok: false, error: 'Folder path is required' };
    }
    
    try {
      shell.openPath(folderPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Failed to open folder' };
    }
  });

  ipcMain.handle('extract-gps', async (_event, payload = {}) => {
    const folder = payload.folder || payload.path;
    if (!folder) {
      return { ok: false, error: 'Folder path is required' };
    }

    const pythonExe = getPythonExecutable();
    const scriptPath = resolveScriptPath('mapOrganizer/extract_gps.py');

    return new Promise((resolve) => {
      try {
        const child = spawn(pythonExe, [scriptPath, folder], {
          windowsHide: true,
          shell: false
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          resolve({ ok: false, error: `Failed to start Python script: ${err.message}` });
        });

        child.on('close', (code) => {
          if (code !== 0) {
            // Check if it's a specific error we can handle
            if (stderr.includes('Folder not found')) {
              resolve({
                ok: false,
                error: 'Folder not found. Please select a valid folder.'
              });
              return;
            }
            
            if (stderr.includes('Permission denied')) {
              resolve({
                ok: false,
                error: 'Permission denied. Please check folder permissions.'
              });
              return;
            }
            
            if (stderr.includes('Pillow library is required')) {
              resolve({
                ok: false,
                error: 'Python Pillow library is not installed. Please install it to process images.'
              });
              return;
            }
            
            resolve({
              ok: false,
              error: `extract_gps.py exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
            });
            return;
          }

          const text = stdout.trim();
          if (!text) {
            resolve({ ok: true, data: [] });
            return;
          }

          try {
            const parsed = JSON.parse(text);
            // Check if the parsed result contains an error
            if (parsed.error) {
              resolve({ ok: false, error: parsed.error });
              return;
            }
            resolve({ ok: true, data: parsed });
          } catch (err) {
            resolve({
              ok: false,
              error: `Failed to parse GPS extraction output: ${err.message}`
            });
          }
        });
      } catch (err) {
        resolve({ ok: false, error: err.message || 'Unknown error during GPS extraction' });
      }
    });
  });

  ipcMain.handle('map-extract-points', async (_event, payload = {}) => {
    const folder = payload.folder || payload.path;
    if (!folder) {
      return { ok: false, error: 'Folder path is required' };
    }

    const pythonExe = getPythonExecutable();
    const scriptPath = resolveScriptPath('mapOrganizer/extract_gps.py');

    return new Promise((resolve) => {
      try {
        const child = spawn(pythonExe, [scriptPath, folder], {
          windowsHide: true,
          shell: false
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          resolve({ ok: false, error: `Failed to start Python: ${err.message}` });
        });

        child.on('close', (code) => {
          if (code !== 0) {
            // Check if it's a specific error we can handle
            if (stderr.includes('Folder not found')) {
              resolve({
                ok: false,
                error: 'Folder not found. Please select a valid folder.'
              });
              return;
            }
            
            if (stderr.includes('Permission denied')) {
              resolve({
                ok: false,
                error: 'Permission denied. Please check folder permissions.'
              });
              return;
            }
            
            resolve({
              ok: false,
              error: `extract_gps.py exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
            });
            return;
          }

          const text = stdout.trim();
          if (!text) {
            resolve({ ok: true, data: [] });
            return;
          }

          try {
            const parsed = JSON.parse(text);
            resolve({ ok: true, data: parsed });
          } catch (err) {
            resolve({
              ok: false,
              error: `Failed to parse extract_points output: ${err.message}`
            });
          }
        });
      } catch (err) {
        resolve({ ok: false, error: err.message || 'Unknown error' });
      }
    });
  });

  ipcMain.handle('map-group-images', async (_event, payload = {}) => {
    const { source, files, destination } = payload;
    if (!source || !destination || !Array.isArray(files)) {
      return { ok: false, error: 'source, destination, and files[] are required' };
    }

    const pythonExe = getPythonExecutable();
    const scriptPath = resolveScriptPath('mapOrganizer/group_images.py');

    return new Promise((resolve) => {
      try {
        const child = spawn(pythonExe, [scriptPath], {
          windowsHide: true,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          resolve({ ok: false, error: `Failed to start Python: ${err.message}` });
        });

        child.on('close', (code) => {
          if (code !== 0) {
            // Check if it's a specific error we can handle
            if (stderr.includes('Source folder not found')) {
              resolve({
                ok: false,
                error: 'Source folder not found. Please select a valid folder.'
              });
              return;
            }
            
            if (stderr.includes('Permission denied')) {
              resolve({
                ok: false,
                error: 'Permission denied. Please check folder permissions.'
              });
              return;
            }
            
            resolve({
              ok: false,
              error: `group_images.py exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
            });
            return;
          }

          try {
            const parsed = JSON.parse(stdout.trim() || '{}');
            if (parsed.success === false) {
              resolve({ ok: false, error: parsed.error || 'Grouping failed' });
              return;
            }
            resolve({ ok: true, data: parsed });
          } catch (err) {
            resolve({ ok: false, error: `Failed to parse group_images output: ${err.message}` });
          }
        });

        child.stdin.write(JSON.stringify({ source, destination, files }));
        child.stdin.end();
      } catch (err) {
        resolve({ ok: false, error: err.message || 'Unknown error' });
      }
    });
  });

  const handleAutoScan = async (event, payload) => {
    if (scanInFlight) {
      return { ok: false, error: 'Scan already in progress' };
    }
    scanInFlight = true;
    try {
      const response = await runPythonScript(
        event,
        'geotag:auto-scan',
        SCRIPT_MAP['geotag:auto-scan'],
        { ...payload, mode: 'scan' },
        'geotag:scan-progress'
      );
      if (event?.sender) {
        event.sender.send('geotag:scan-complete', response);
      }
      return { ok: true, data: response };
    } catch (err) {
      return { ok: false, error: err.message || 'Scan failed' };
    } finally {
      scanInFlight = false;
    }
  };

  if (!ipcMain.eventNames().includes('geotag:auto-scan')) {
    ipcMain.handle('geotag:auto-scan', handleAutoScan);
  }
  // backward compatibility alias
  if (!ipcMain.eventNames().includes('geotag:scan-images')) {
    ipcMain.handle('geotag:scan-images', handleAutoScan);
  }

  // Flight renamer: preview
  ipcMain.handle('renamer:preview', async (event, payload) => {
    try {
      const response = await runPythonScript(event, 'renamer:preview', SCRIPT_MAP['renamer:preview'], payload);
      return { ok: true, data: response };
    } catch (err) {
      return {
        ok: false,
        error: err.message || 'Unknown error',
        script: SCRIPT_MAP['renamer:preview']
      };
    }
  });

  // Flight renamer: execute
  ipcMain.handle('renamer:execute', async (event, payload) => {
    try {
      const response = await runPythonScript(event, 'renamer:execute', SCRIPT_MAP['renamer:execute'], payload);
      return { ok: true, data: response };
    } catch (err) {
      return {
        ok: false,
        error: err.message || 'Unknown error',
        script: SCRIPT_MAP['renamer:execute']
      };
    }
  });

  // Flight renamer: undo
  ipcMain.handle('renamer:undo', async (event, payload) => {
    try {
      const response = await runPythonScript(event, 'renamer:undo', SCRIPT_MAP['renamer:undo'], payload);
      return { ok: true, data: response };
    } catch (err) {
      return {
        ok: false,
        error: err.message || 'Unknown error',
        script: SCRIPT_MAP['renamer:undo']
      };
    }
  });

  // Add handler for map:load to load images with GPS data
  ipcMain.handle('map:load', async (_event, payload = {}) => {
    const folder = payload.folder || payload.path;
    if (!folder) {
      return { ok: false, error: 'Folder path is required' };
    }

    const pythonExe = getPythonExecutable();
    const scriptPath = resolveScriptPath('mapOrganizer/map_loader.py');

    return new Promise((resolve) => {
      try {
        const child = spawn(pythonExe, [scriptPath, folder], {
          windowsHide: true,
          shell: false
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          resolve({ ok: false, error: `Failed to start Python script: ${err.message}` });
        });

        child.on('close', (code) => {
          if (code !== 0) {
            // Check if it's a specific error we can handle
            if (stderr.includes('Folder not found')) {
              resolve({
                ok: false,
                error: 'Folder not found. Please select a valid folder.'
              });
              return;
            }
            
            if (stderr.includes('Permission denied')) {
              resolve({
                ok: false,
                error: 'Permission denied. Please check folder permissions.'
              });
              return;
            }
            
            resolve({
              ok: false,
              error: `map_loader.py exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
            });
            return;
          }

          const text = stdout.trim();
          if (!text) {
            resolve({ ok: false, error: 'No output from script' });
            return;
          }

          try {
            const parsed = JSON.parse(text);
            if (parsed.error) {
              resolve({ ok: false, error: parsed.error });
              return;
            }
            resolve({ ok: true, data: parsed });
          } catch (err) {
            resolve({
              ok: false,
              error: `Failed to parse map_loader output: ${err.message}`
            });
          }
        });
      } catch (err) {
        resolve({ ok: false, error: err.message || 'Unknown error during map loading' });
      }
    });
  });
  
  // Add specific handler for map:copy-selected to handle the three arguments
  ipcMain.handle('map:copy-selected', async (_event, payload = {}) => {
    const { source, destination, filenames } = payload;
    
    if (!source || !destination || !filenames) {
      return { success: false, copied_count: 0, error: 'source, destination, and filenames are required' };
    }
    
    if (!Array.isArray(filenames)) {
      return { success: false, copied_count: 0, error: 'filenames must be an array' };
    }
    
    const pythonExe = getPythonExecutable();
    const scriptPath = resolveScriptPath('mapOrganizer/copy_selected.py');
    
    return new Promise((resolve) => {
      try {
        // Pass the three arguments to the Python script
        const child = spawn(pythonExe, [scriptPath, source, destination, JSON.stringify(filenames)], {
          windowsHide: true,
          shell: false
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('error', (err) => {
          resolve({ success: false, copied_count: 0, error: `Failed to start Python script: ${err.message}` });
        });
        
        child.on('close', (code) => {
          if (code !== 0) {
            // Check if it's a specific error we can handle
            if (stderr.includes('Permission denied')) {
              resolve({
                success: false,
                copied_count: 0,
                error: 'Permission denied. Please check folder permissions.'
              });
              return;
            }
            
            resolve({
              success: false,
              copied_count: 0,
              error: `copy_selected.py exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
            });
            return;
          }
          
          const text = stdout.trim();
          if (!text) {
            resolve({ success: false, copied_count: 0, error: 'No output from script' });
            return;
          }
          
          try {
            const parsed = JSON.parse(text);
            resolve(parsed);
          } catch (err) {
            resolve({
              success: false,
              copied_count: 0,
              error: `Failed to parse copy_selected output: ${err.message}`
            });
          }
        });
      } catch (err) {
        resolve({ success: false, copied_count: 0, error: err.message || 'Unknown error during copy operation' });
      }
    });
  });
  
  // Add handler for map:export-images to export selected images with full paths
  ipcMain.handle('map:export-images', async (_event, payload = {}) => {
    const { sourcePaths, destination } = payload;
    
    if (!sourcePaths || !destination) {
      return { success: false, exported_count: 0, error: 'sourcePaths and destination are required' };
    }
    
    if (!Array.isArray(sourcePaths)) {
      return { success: false, exported_count: 0, error: 'sourcePaths must be an array' };
    }
    
    const pythonExe = getPythonExecutable();
    const scriptPath = resolveScriptPath('mapOrganizer/export_images.py');
    
    return new Promise((resolve) => {
      try {
        // Pass the JSON payload to the Python script via stdin
        const child = spawn(pythonExe, [scriptPath], {
          windowsHide: true,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('error', (err) => {
          resolve({ success: false, exported_count: 0, error: `Failed to start Python script: ${err.message}` });
        });
        
        child.on('close', (code) => {
          if (code !== 0) {
            // Check if it's a specific error we can handle
            if (stderr.includes('Permission denied')) {
              resolve({
                success: false,
                exported_count: 0,
                error: 'Permission denied. Please check folder permissions.'
              });
              return;
            }
            
            resolve({
              success: false,
              exported_count: 0,
              error: `export_images.py exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`
            });
            return;
          }
          
          const text = stdout.trim();
          if (!text) {
            resolve({ success: false, exported_count: 0, error: 'No output from script' });
            return;
          }
          
          try {
            const parsed = JSON.parse(text);
            resolve(parsed);
          } catch (err) {
            resolve({
              success: false,
              exported_count: 0,
              error: `Failed to parse export_images output: ${err.message}`
            });
          }
        });
        
        // Send the payload as JSON to the Python script
        child.stdin.write(JSON.stringify({ sourcePaths, destination }));
        child.stdin.end();
      } catch (err) {
        resolve({ success: false, exported_count: 0, error: err.message || 'Unknown error during export operation' });
      }
    });
  });
  
  Object.entries(SCRIPT_MAP).forEach(([channel, script]) => {
    if (channel === 'renamer:preview' || channel === 'renamer:execute' || channel === 'renamer:undo' || channel === 'geotag:auto-scan' || channel === 'map:copy-selected' || channel === 'map:load' || channel === 'map:export-images') {
      return; // handled explicitly above
    }
    ipcMain.handle(channel, async (event, payload) => {
      try {
        const response = await runPythonScript(event, channel, script, payload);
        return { ok: true, data: response };
      } catch (err) {
        return {
          ok: false,
          error: err.message || 'Unknown error',
          script
        };
      }
    });
  });
};

app.whenReady().then(() => {
  // Ensure cache directory exists
  const userDataPath = app.getPath('userData');
  const cachePath = path.join(userDataPath, 'Cache');
  try {
    require('fs').mkdirSync(cachePath, { recursive: true });
  } catch (err) {
    console.log('Could not create cache directory:', err);
  }
  
  createWindow();
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

