const { contextBridge, ipcRenderer } = require('electron');

const safeInvoke = (channel, payload) => ipcRenderer.invoke(channel, payload);

const onChannel = (channel, handler) => {
  if (typeof handler !== 'function') return () => {};
  const listener = (_event, data) => handler(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => safeInvoke('dialog:select-folder'),
  selectFiles: () => safeInvoke('dialog:select-files'),
  selectSaveCsv: () => safeInvoke('dialog:save-csv'),
  extractGeotag: (payload) => safeInvoke('geotag:extract', payload),
  writeGeotag: (payload) => safeInvoke('geotag:write', payload),
  renameFlightImages: (payload) => {
    const mode = payload?.mode;
    let channel = 'renamer:execute';
    if (mode === 'preview') channel = 'renamer:preview';
    else if (mode === 'undo') channel = 'renamer:undo';
    return safeInvoke(channel, payload);
  },
  scanImages: (payload) => safeInvoke('geotag:auto-scan', payload),
  autoScan: (payload) => safeInvoke('geotag:auto-scan', payload),
  extractMapPoints: (payload) => safeInvoke('map:extract', payload),
  groupImages: (payload) => safeInvoke('map:group', payload),
  copySelectedImages: (payload) => safeInvoke('map:copy-selected', payload),
  exportImages: (payload) => safeInvoke('map:export-images', payload),
  mapLoader: (payload) => safeInvoke('map:load', payload),
  importKml: (payload) => safeInvoke('map:import-kml', payload),
  changeLanguage: (locale) => safeInvoke('i18n:set-language', { locale }),
  openFolder: (path) => safeInvoke('open-folder', { path }),
  onGeotagProgress: (handler) => onChannel('geotag:progress', handler),
  onScanProgress: (handler) => onChannel('geotag:scan-progress', handler),
  onScanComplete: (handler) => onChannel('geotag:scan-complete', handler),
  onMenuAction: (handler) => onChannel('menu-action', handler)
});

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => safeInvoke('open-folder-dialog'),
  extractMapPoints: (payload) => safeInvoke('map-extract-points', payload),
  extractGPS: (payload) => safeInvoke('extract-gps', payload),
  groupImages: (payload) => safeInvoke('map-group-images', payload),
  copySelectedImages: (payload) => safeInvoke('map:copy-selected', payload),
  exportImages: (payload) => safeInvoke('map:export-images', payload),
  mapLoader: (payload) => safeInvoke('map:load', payload),
  openFolder: (path) => safeInvoke('open-folder', { path })
});

