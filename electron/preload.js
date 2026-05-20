import { contextBridge, ipcRenderer } from 'electron';

const resolvedPort = (() => {
  try {
    const p = ipcRenderer.sendSync('pfp-get-server-port');
    const n = Number(p);
    if (Number.isFinite(n) && n >= 1 && n <= 65535) return Math.floor(n);
  } catch {}
  return 3000;
})();

const appVersion = (() => {
  try {
    const v = ipcRenderer.sendSync('pfp-get-app-version');
    return String(v || '').trim() || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

const apiBase = `http://localhost:${resolvedPort}`;

// #region debug-point C:preload-errors
process.env.PFP_DEBUG === '1' && window.addEventListener('error', (e) => fetch(process.env.DEBUG_SERVER_URL || 'http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: process.env.DEBUG_SESSION_ID || 'packaged-white-screen', runId: process.env.PFP_DEBUG_RUN_ID || 'pre-fix', hypothesisId: 'C', location: 'electron/preload.js:window.error', msg: '[DEBUG] window error', data: { message: e?.message || '', filename: e?.filename || '', lineno: e?.lineno || 0, colno: e?.colno || 0 }, ts: Date.now() }) }).catch(() => {}));
process.env.PFP_DEBUG === '1' && window.addEventListener('unhandledrejection', (e) => fetch(process.env.DEBUG_SERVER_URL || 'http://127.0.0.1:7777/event', { method: 'POST', body: JSON.stringify({ sessionId: process.env.DEBUG_SESSION_ID || 'packaged-white-screen', runId: process.env.PFP_DEBUG_RUN_ID || 'pre-fix', hypothesisId: 'C', location: 'electron/preload.js:unhandledrejection', msg: '[DEBUG] unhandledrejection', data: { reason: String(e?.reason || '') }, ts: Date.now() }) }).catch(() => {}));
// #endregion

contextBridge.exposeInMainWorld('electron', {
  serverPort: resolvedPort,
  appVersion,
  apiBase,
  searchVerse: (reference, translation) => ipcRenderer.invoke('search-verse', reference, translation),
  getVerses: (references) => ipcRenderer.invoke('get-verses', references),
  selectBibleXmlFiles: () => ipcRenderer.invoke('select-bible-xml-files'),
  importBibleXmlFiles: (files) => ipcRenderer.invoke('import-bible-xml-files', files),
  selectMediaFiles: () => ipcRenderer.invoke('select-media-files'),
  importMediaFiles: (filePaths) => ipcRenderer.invoke('import-media-files', filePaths),
  exportPlanJson: (planId) => ipcRenderer.invoke('export-plan-json', planId),
  importPlanJson: () => ipcRenderer.invoke('import-plan-json'),
  openOutputWindow: (outputPath) => ipcRenderer.invoke('open-output-window', outputPath)
});
