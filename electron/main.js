const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const isDev = !app.isPackaged;
let autoUpdater;
let electronLog;

const pythonPath = isDev
  ? 'python'
  : path.join(process.resourcesPath, 'python', 'python.exe');

const getPythonScript = (script) =>
  isDev
    ? path.join(__dirname, '..', 'python', script)
    : path.join(process.resourcesPath, 'python', script);

const getBundledExe = (exeName) => {
  if (!app.isPackaged) return null;
  const exePath = path.join(process.resourcesPath, 'python', `${exeName}.exe`);
  try {
    if (fs.existsSync(exePath)) {
      return exePath;
    }
    logToFile(`Bundled executable not found: ${exePath}`);
  } catch (err) {
    logToFile(`Error checking bundled executable ${exePath}: ${err?.message || err}`);
  }
  return null;
};

// Set Chromium flags early to prevent GPU/cache errors
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('disable-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');
try {
  const userDataPath = app.getPath('userData');
  const cachePath = path.join(userDataPath, 'Cache');
  fs.mkdirSync(cachePath, { recursive: true });
  app.commandLine.appendSwitch('disk-cache-dir', cachePath);
} catch (_err) {
  // If cache path fails, continue with defaults; avoid crashing startup
}

const logToFile = (message) => {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'app.log'), `[${new Date().toISOString()}] ${message}\n`);
  } catch (_err) {
    // Swallow logging failures to avoid crashing the app
  }
};

// Silence harmless DevTools autofill warnings and capture crashes without bringing down the UI
process.on('unhandledRejection', (reason) => {
  try {
    if (typeof reason?.message === 'string' && reason.message.includes('Autofill.enable')) {
      return;
    }
  } catch (_e) {
    // ignore
  }
  logToFile(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  if (!app.isPackaged) {
    // eslint-disable-next-line no-console
    console.error(reason);
  }
});

process.on('uncaughtException', (err) => {
  logToFile(`Uncaught exception: ${err?.message || err}`);
  if (!app.isPackaged) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
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

  if (!isDev) {
    try {
      if (fs.existsSync(pythonPath)) {
        return pythonPath;
      }
    } catch (_err) {
      // fall through to null
    }
    return null;
  }

  const devRoot = path.join(__dirname, '..', 'python');
  const devCandidates = [
    path.join(devRoot, 'python.exe'),
    path.join(devRoot, 'runtime', 'python.exe')
  ];

  const devBundled = devCandidates.find((candidate) => {
    try {
      return fs.existsSync(candidate);
    } catch (_err) {
      return false;
    }
  });

  if (devBundled) return devBundled;

  const fallback = process.platform === 'win32' ? 'python.exe' : 'python';
  return fallback || 'py';
};

const resolveScriptPath = (relativeScript) => getPythonScript(relativeScript);

const runPackagedExe = ({ exeName, args = [], stdinPayload }) =>
  new Promise((resolve, reject) => {
    const exePath = getBundledExe(exeName);
    if (!exePath) {
      return reject(new Error(`Executable not found: ${exeName}`));
    }
    try {
      const child = spawn(exePath, args, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      if (stdinPayload) {
        child.stdin.write(stdinPayload);
        child.stdin.end();
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      child.on('error', (err) => {
        reject(new Error(`Failed to start ${exeName}.exe: ${err.message}`));
      });
      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`${exeName}.exe exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
          return;
        }
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      });
    } catch (err) {
      reject(err);
    }
  });

const preventDevToolsShortcuts = (webContents) => {
  if (!webContents) return;

  webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toLowerCase();
    const isDevToolsCombo = (input.control || input.meta) && input.shift && key === 'i';
    const isF12 = key === 'f12';

    if (isDevToolsCombo || isF12) {
      event.preventDefault();
    }
  });

  webContents.on('devtools-opened', () => {
    webContents.closeDevTools();
  });
};

const hardenWebContents = (win) => {
  if (!win?.webContents) return;
  preventDevToolsShortcuts(win.webContents);

  win.webContents.on('will-attach-webview', (event) => {
    // Disallow attaching webviews to reduce attack surface
    event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
};

const initAutoUpdater = () => {
  if (!app.isPackaged) {
    logToFile('Auto-updater skipped: app is not packaged');
    return;
  }

  try {
    // Lazy-load to avoid crashing if dependencies are missing/corrupt
    if (!autoUpdater) {
      autoUpdater = require('electron-updater').autoUpdater;
    }
    if (!electronLog) {
      electronLog = require('electron-log');
    }
  } catch (err) {
    logToFile(`Auto-updater modules failed to load: ${err?.message || err}`);
    return;
  }

  try {
    electronLog.transports.file.level = 'info';
    autoUpdater.logger = electronLog;
    autoUpdater.autoDownload = true; // keep enabled for production, still safe on failures
  } catch (err) {
    logToFile(`Failed to configure auto-updater logging: ${err?.message || err}`);
  }

  autoUpdater.on('error', (err) => {
    logToFile(`Auto-updater error: ${err?.message || err}`);
  });

  autoUpdater.on('update-not-available', () => {
    logToFile('Auto-updater: no updates available');
  });

  autoUpdater.on('update-downloaded', () => {
    logToFile('Auto-updater: update downloaded; will notify user on restart');
  });

  // Do not throw on network/server errors; just log and continue
  try {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      logToFile(`Auto-updater check failed: ${err?.message || err}`);
    });
  } catch (err) {
    logToFile(`Auto-updater failed to start: ${err?.message || err}`);
  }
};

const getRenameExecutable = () => {
  if (!app.isPackaged) return null;
  const exePath = path.join(process.resourcesPath, 'python', 'rename_images.exe');
  try {
    if (fs.existsSync(exePath)) {
      return exePath;
    }
    logToFile(`rename_images.exe not found at ${exePath}`);
  } catch (err) {
    logToFile(`Error checking rename_images.exe: ${err?.message || err}`);
  }
  return null;
};

const runRenamer = (event, channel, payload) =>
  new Promise((resolve, reject) => {
    const exePath = getRenameExecutable();
    if (exePath) {
      const args = [JSON.stringify(payload || {})];
      const child = spawn(exePath, args, { windowsHide: true, shell: false });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('error', (err) => {
        reject(new Error(`Failed to start rename_images.exe: ${err.message}`));
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(
            new Error(
              `rename_images.exe exited with code ${code}. Stderr: ${stderr || 'n/a'}`
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

      return;
    }

    runPythonScript(event, channel, SCRIPT_MAP[channel], payload)
      .then(resolve)
      .catch(reject);
  });

const runBundledToolOrPython = ({
  exeName,
  args = [],
  stdinPayload,
  relativeScript,
  payload = {},
  event,
  channel,
  progressChannelOverride,
  timeoutMs = 20000
}) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${exeName} timeout after ${timeoutMs}ms`)), timeoutMs);
    const settle = (fn) => (value) => {
      clearTimeout(timer);
      fn(value);
    };

    const exePath = getBundledExe(exeName);
    if (exePath) {
      logToFile(`[Runner] Using packaged exe ${exeName} at ${exePath} args=${JSON.stringify(args)}`);
      const child = spawn(exePath, args, { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      if (stdinPayload) {
        child.stdin.write(stdinPayload);
        child.stdin.end();
      }

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      child.on('error', settle((err) => {
        reject(new Error(`Failed to start ${exeName}.exe: ${err.message}`));
      }));
      child.on('close', settle((code) => {
        if (code !== 0) {
          reject(new Error(`${exeName}.exe exited with code ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
          return;
        }
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }));
      return;
    }

    // Dev or python fallback: run python script
    runPythonScript(event, channel, relativeScript, payload, progressChannelOverride, timeoutMs)
      .then(settle(resolve))
      .catch(settle(reject));
  });

const parseJsonFromOutput = (text) => {
  if (!text) return null;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch (_err) {
      // Continue scanning for the final JSON payload
    }
  }
  try {
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
};

const normalizeScanResult = (payload) => {
  const images = Array.isArray(payload?.images) ? payload.images : [];
  const stats = payload?.stats || {};
  const normalizedStats = {
    total: images.length,
    withGps: stats.withGps ?? images.length,
    missingGps: stats.missingGps ?? 0,
    writable:
      stats.writable ??
      images.reduce((acc, img) => acc + (img && img.writable !== false ? 1 : 0), 0)
  };

  return {
    ...payload,
    images,
    stats: { ...stats, ...normalizedStats }
  };
};

const runPythonScript = (
  event,
  channel,
  relativeScript,
  payload = {},
  progressChannelOverride,
  timeoutMs = 20000
) =>
  new Promise((resolve, reject) => {
    const scriptPath = resolveScriptPath(relativeScript);
    const pythonExe = getPythonExecutable();
    logToFile(`[Runner] Using python=${pythonExe || 'null'} script=${scriptPath}`);
    if (!pythonExe) {
      return reject(new Error('Python executable not available in packaged build'));
    }
    const args = [scriptPath, JSON.stringify(payload || {})];

    const child = spawn(pythonExe, args, {
      windowsHide: true,
      shell: false
    });

    let stdout = '';
    let stderr = '';
    const progressChannel = progressChannelOverride || `${channel}:progress`;

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch (_e) {
        // ignore
      }
      reject(new Error(`${relativeScript} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

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
      clearTimeout(timer);
      reject(new Error(`Failed to start Python script: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
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
      devTools: false, // Disable devtools in all environments for hardening
      backgroundThrottling: false,
      // Disable GPU acceleration to prevent cache errors
      offscreen: false
    }
  });

  mainWindow.removeMenu();
  hardenWebContents(mainWindow);

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
      defaultPath: path.join(app.getPath('documents'), 'geotag.csv')
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

    try {
      const result = await runBundledToolOrPython({
        exeName: 'extract_gps',
        args: [folder],
        relativeScript: 'mapOrganizer/extract_gps.py',
        payload: { folder }
      });

      const text = (result?.stdout || '').trim();
      if (!text) {
        return { ok: true, data: [] };
      }

      try {
        const parsed = JSON.parse(text);
        if (parsed.error) {
          return { ok: false, error: parsed.error };
        }
        return { ok: true, data: parsed };
      } catch (err) {
        return { ok: false, error: `Failed to parse GPS extraction output: ${err.message}` };
      }
    } catch (err) {
      const message = err?.message || 'Unknown error during GPS extraction';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('map-extract-points', async (_event, payload = {}) => {
    const folder = payload.folder || payload.path;
    if (!folder) {
      return { ok: false, error: 'Folder path is required' };
    }

    try {
      const result = await runBundledToolOrPython({
        exeName: 'extract_gps',
        args: [folder],
        relativeScript: 'mapOrganizer/extract_gps.py',
        payload: { folder }
      });

      const text = (result?.stdout || '').trim();
      if (!text) {
        return { ok: true, data: [] };
      }

      try {
        const parsed = JSON.parse(text);
        return { ok: true, data: parsed };
      } catch (err) {
        return { ok: false, error: `Failed to parse extract_points output: ${err.message}` };
      }
    } catch (err) {
      return { ok: false, error: err?.message || 'Unknown error' };
    }
  });

  ipcMain.handle('map-group-images', async (_event, payload = {}) => {
    const { source, files, destination } = payload;
    if (!source || !destination || !Array.isArray(files)) {
      return { ok: false, error: 'source, destination, and files[] are required' };
    }

    const pythonExe = getPythonExecutable();
    if (!pythonExe) {
      return { ok: false, error: 'Python runtime is not available in the packaged build' };
    }
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

  ipcMain.handle('geotag:extract', async (event, payload = {}) => {
    const folder = payload.folder || payload.path;
    if (!folder) {
      return { ok: false, error: 'Folder path is required' };
    }

    const args = [JSON.stringify({ ...payload, folder })];
    try {
      const result = await runBundledToolOrPython({
        exeName: 'extract_gps',
        args,
        relativeScript: 'geotagging/extract_gps.py',
        payload: { ...payload, folder },
        event,
        channel: 'geotag:extract',
        progressChannelOverride: 'geotag:progress'
      });

      const rawOutput = typeof result?.stdout === 'string' ? result.stdout : result;
      const parsed =
        typeof rawOutput === 'string' ? parseJsonFromOutput(rawOutput) : rawOutput?.data || rawOutput;

      if (!parsed) {
        return { ok: false, error: 'No output received from extractor' };
      }
      if (parsed.error) {
        return { ok: false, error: parsed.error };
      }
      const normalized = normalizeScanResult(parsed);
      return { ok: true, data: normalized };
    } catch (err) {
      return { ok: false, error: err?.message || 'GPS extraction failed' };
    }
  });

  ipcMain.handle('geotag:write', async (_event, payload = {}) => {
    const folder = payload.folder || payload.path;
    const csvPath = payload.csv || payload.csvPath;
    if (!folder || !csvPath) {
      return { ok: false, error: 'Folder and CSV path are required' };
    }
    const args = [JSON.stringify({ ...payload, folder, csv: csvPath, csvPath })];
    try {
      const result = await runBundledToolOrPython({
        exeName: 'write_gps',
        args,
        relativeScript: 'geotagging/write_gps.py',
        payload: { ...payload, folder, csv: csvPath }
      });
      const rawOutput = typeof result?.stdout === 'string' ? result.stdout : result;
      const parsed =
        typeof rawOutput === 'string' ? parseJsonFromOutput(rawOutput) : rawOutput?.data || rawOutput;

      if (!parsed) {
        return { ok: false, error: 'No output received from write_gps' };
      }
      if (parsed.error) {
        return { ok: false, error: parsed.error };
      }
      return { ok: true, data: parsed };
    } catch (err) {
      return { ok: false, error: err?.message || 'Write GPS failed' };
    }
  });

  const handleAutoScan = async (event, payload) => {
    if (scanInFlight) {
      return { ok: false, error: 'Scan already in progress' };
    }
    scanInFlight = true;
    try {
      const folder = payload?.folder || payload?.path;
      if (!folder) {
        scanInFlight = false;
        return { ok: false, error: 'Folder path is required' };
      }

      if (app.isPackaged) {
        const exePath = getBundledExe('extract_gps');
        const scanPayload = { ...payload, folder, mode: 'scan' };
        const args = [JSON.stringify(scanPayload)];
        logToFile(
          `[GeoTag] Running packaged extract_gps.exe: ${exePath || 'not found'} args=${JSON.stringify(args)}`
        );
        if (!exePath) {
          scanInFlight = false;
          return { ok: false, error: 'extract_gps.exe not found in resources' };
        }

        try {
          const result = await runBundledToolOrPython({
            exeName: 'extract_gps',
            args,
            relativeScript: 'geotagging/extract_gps.py', // unused in prod, kept for dev
            payload: scanPayload,
            event,
            channel: 'geotag:auto-scan',
            progressChannelOverride: 'geotag:scan-progress'
          });

          logToFile(`[GeoTag] extract_gps.exe stdout: ${result?.stdout || ''}`);
          const parsed = parseJsonFromOutput((result?.stdout || '').trim());
          if (!parsed) {
            return { ok: false, error: 'Failed to parse scan output: no JSON payload found' };
          }
          const normalized = normalizeScanResult(parsed);
          logToFile(`[GeoTag] Parsed scan result images=${normalized.images.length}`);
          if (event?.sender) {
            event.sender.send('geotag:scan-complete', normalized);
          }
          return { ok: true, data: normalized };
        } catch (err) {
          logToFile(`[GeoTag] extract_gps.exe error: ${err?.message || err}`);
          return { ok: false, error: err?.message || 'Scan failed' };
        }
      }

      // Development: run python script
      const response = await runPythonScript(
        event,
        'geotag:auto-scan',
        SCRIPT_MAP['geotag:auto-scan'],
        { ...payload, mode: 'scan' },
        'geotag:scan-progress'
      );
      const normalizedDev = normalizeScanResult(response);
      logToFile(`[GeoTag] Dev scan parsed images=${normalizedDev.images.length}`);
      if (event?.sender) {
        event.sender.send('geotag:scan-complete', normalizedDev);
      }
      return { ok: true, data: normalizedDev };
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
      const response = await runRenamer(event, 'renamer:preview', payload);
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
      const response = await runRenamer(event, 'renamer:execute', payload);
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
      const response = await runRenamer(event, 'renamer:undo', payload);
      return { ok: true, data: response };
    } catch (err) {
      return {
        ok: false,
        error: err.message || 'Unknown error',
        script: SCRIPT_MAP['renamer:undo']
      };
    }
  });

  const resolveMapLoaderExecutable = () => {
    const packagedPath = path.join(process.resourcesPath, 'python', 'map_loader.exe');
    try {
      if (fs.existsSync(packagedPath)) {
        return packagedPath;
      }
    } catch (err) {
      logToFile(`[MapLoad] Error checking packaged map_loader.exe: ${err?.message || err}`);
    }

    // Dev fallback so the feature remains testable locally
    const devPath = path.join(__dirname, 'python', 'map_loader.exe');
    try {
      if (fs.existsSync(devPath)) {
        return devPath;
      }
    } catch (err) {
      logToFile(`[MapLoad] Error checking dev map_loader.exe: ${err?.message || err}`);
    }

    return null;
  };

  const runMapLoaderProcess = (folder) =>
    new Promise((resolve) => {
      const exePath = resolveMapLoaderExecutable();
      if (!exePath) {
        logToFile('[MapLoad] map_loader.exe not found in expected paths');
        resolve({ ok: false, error: 'Map loading failed' });
        return;
      }

      const args = [folder];
      logToFile(`[MapLoad] exe=${exePath} args=${JSON.stringify(args)}`);

      try {
        const child = spawn(exePath, args, {
          windowsHide: true,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';
        let exitCode = null;

        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        child.on('error', (err) => {
          logToFile(`[MapLoad] spawn error: ${err?.message || err}`);
          resolve({ ok: false, error: 'Map loading failed' });
        });

        child.on('close', (code) => {
          exitCode = code ?? 0;
          const trimmedStdout = (stdout || '').trim();
          const trimmedStderr = (stderr || '').trim();
          logToFile(`[MapLoad] exit=${exitCode} stdout=${trimmedStdout} stderr=${trimmedStderr}`);

          if (trimmedStdout) {
            try {
              const parsed = JSON.parse(trimmedStdout);
              logToFile(`[MapLoad] parsed=${JSON.stringify(parsed)}`);

              if (Array.isArray(parsed.images)) {
                if (parsed.images.length === 0) {
                  resolve({
                    ok: true,
                    data: parsed,
                    message: 'No GPS-tagged images found in this folder',
                    exitCode
                  });
                  return;
                }
              }

              resolve({ ok: true, data: parsed, exitCode });
              return;
            } catch (err) {
              resolve({ ok: false, error: `Map loading failed: ${err.message}`, exitCode });
              return;
            }
          }

          resolve({
            ok: false,
            error: trimmedStderr ? `Map loading failed: ${trimmedStderr}` : 'Map loading failed',
            exitCode
          });
        });
      } catch (err) {
        logToFile(`[MapLoad] unexpected error: ${err?.message || err}`);
        resolve({ ok: false, error: 'Map loading failed' });
      }
    });

  // Add handler for map:load to load images with GPS data
  ipcMain.handle('map:load', async (_event, payload = {}) => {
    const folder = payload.folder || payload.path;
    if (!folder) {
      return { ok: false, error: 'Folder path is required' };
    }

    try {
      const response = await runMapLoaderProcess(folder);
      return response;
    } catch (err) {
      return { ok: false, error: err?.message || 'Map loading failed' };
    }
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

    const sourceDir = path.resolve(source);
    const destDir = path.resolve(destination);

    try {
      await fs.promises.mkdir(destDir, { recursive: true });
    } catch (err) {
      return {
        success: false,
        copied_count: 0,
        error: `Failed to create destination folder: ${err?.message || err}`
      };
    }

    let copied = 0;
    const failed = [];

    for (const name of filenames) {
      if (!name || typeof name !== 'string') {
        failed.push({ file: name, error: 'Invalid filename' });
        continue;
      }

      const srcPath = path.join(sourceDir, name);
      const destPath = path.join(destDir, path.basename(name));

      try {
        const stat = await fs.promises.stat(srcPath);
        if (!stat.isFile()) {
          failed.push({ file: name, error: 'Source is not a file' });
          continue;
        }
        await fs.promises.copyFile(srcPath, destPath);
        copied += 1;
      } catch (err) {
        failed.push({ file: name, error: err?.message || 'Copy failed' });
      }
    }

    return {
      success: copied > 0 && failed.length === 0 ? true : copied > 0,
      copied_count: copied,
      failed_files: failed,
      partial_failure: failed.length > 0
    };
  });
  
  // Add handler for map:export-images / export-selected-images to export selected images with full paths
  const handleExportImages = async (_event, payload = {}) => {
    const sourcePaths =
      payload.sourcePaths ||
      (Array.isArray(payload.images) ? payload.images.map((img) => img?.path).filter(Boolean) : []);

    if (!Array.isArray(sourcePaths) || !sourcePaths.length) {
      return { success: false, exported_count: 0, error: 'No source images provided' };
    }

    let destination = payload.destination;
    if (!destination) {
      const dlg = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      });
      if (dlg.canceled || !dlg.filePaths?.[0]) {
        return { success: false, exported_count: 0, error: 'Export cancelled by user' };
      }
      destination = dlg.filePaths[0];
    }

    const destRoot = path.resolve(destination);
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, '')
      .replace('T', '_');
    const exportFolderName = `Exported_Region_${timestamp}`;
    const exportFolderPath = path.join(destRoot, exportFolderName);

    logToFile(`[ExportImages] destination root=${destRoot} folder=${exportFolderName}`);

    try {
      await fs.promises.mkdir(exportFolderPath, { recursive: true });
    } catch (err) {
      return {
        success: false,
        exported_count: 0,
        error: `Failed to create export folder: ${err?.message || err}`
      };
    }

    let exported = 0;
    const failed = [];

    for (const src of sourcePaths) {
      if (!src || typeof src !== 'string') {
        failed.push({ file: src, error: 'Invalid source path' });
        continue;
      }
      const destPath = path.join(exportFolderPath, path.basename(src));
      try {
        const stat = await fs.promises.stat(src);
        if (!stat.isFile()) {
          failed.push({ file: src, error: 'Source is not a file' });
          continue;
        }
        logToFile(`[ExportImages] copy ${src} -> ${destPath}`);
        await fs.promises.copyFile(src, destPath);
        exported += 1;
      } catch (err) {
        failed.push({ file: src, error: err?.message || 'Copy failed' });
      }
    }

    return {
      success: exported > 0 && failed.length === 0 ? true : exported > 0,
      exported_count: exported,
      failed_files: failed,
      export_folder_name: exportFolderName,
      export_folder_path: exportFolderPath,
      partial_failure: failed.length > 0
    };
  };

  ipcMain.handle('map:export-images', handleExportImages);
  ipcMain.handle('export-selected-images', handleExportImages);
  
  Object.entries(SCRIPT_MAP).forEach(([channel, script]) => {
    if (
      channel === 'renamer:preview' ||
      channel === 'renamer:execute' ||
      channel === 'renamer:undo' ||
      channel === 'geotag:auto-scan' ||
      channel === 'geotag:extract' ||
      channel === 'geotag:write' ||
      channel === 'map:copy-selected' ||
      channel === 'map:load' ||
      channel === 'map:export-images' ||
      channel === 'export-selected-images'
    ) {
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
    logToFile(`Could not create cache directory: ${err?.message || err}`);
  }
  
  createWindow();
  registerIpcHandlers();
  initAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

app.on('browser-window-created', (_event, window) => {
  window?.removeMenu();
  hardenWebContents(window);
});

app.on('web-contents-created', (_event, contents) => {
  preventDevToolsShortcuts(contents);
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

app.on('render-process-gone', (_event, _webContents, details) => {
  logToFile(`Renderer process gone: ${details?.reason || 'unknown'}`);
});
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

