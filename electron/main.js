import { app, BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { startServer, stopServer } from './server.js';
import { closeDatabase, getDatabase } from './database.js';
import { guessTranslationFromFilename, importBibleXmlFiles } from './bibleImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let mainWindow;
let isDev = !app.isPackaged;
let serverPort = 3000;
const outputWindows = new Map();
const DEBUG_SERVER_URL = process.env.DEBUG_SERVER_URL || 'http://127.0.0.1:7777/event';
const DEBUG_SESSION_ID = process.env.DEBUG_SESSION_ID || 'packaged-white-screen';
const DEBUG_RUN_ID = process.env.PFP_DEBUG_RUN_ID || (app.isPackaged ? 'pre-fix' : 'dev');
const PFP_DEBUG = process.env.PFP_DEBUG === '1';
const APP_ICON_PNG = path.join(__dirname, '../assets/icon.png');

const OUTPUT_TITLES = {
  '/display': 'Congregation Display',
  '/stream': 'Stream Overlay',
  '/stage': 'Stage Monitor',
  '/preacher': 'Preacher Monitor',
  '/remote': 'Remote Control',
  '/preview': 'Tech Preview'
};
const log = (...args) => {
  if (isDev) console.log(...args);
};

// #region debug-point BI0:debug-reporter
const BIBLE_DEBUG_SESSION_ID = 'bible-import-hang';
let BIBLE_DEBUG_SERVER_URL = '';
let BIBLE_DEBUG_RUN_ID = process.env.PFP_BIBLE_DEBUG_RUN_ID || process.env.PFP_DEBUG_RUN_ID || (app.isPackaged ? 'pre' : 'dev');
try {
  const envPath = path.join(process.cwd(), '.dbg', `${BIBLE_DEBUG_SESSION_ID}.env`);
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    const line = raw.split(/\r?\n/).find((l) => l.startsWith('DEBUG_SERVER_URL='));
    if (line) BIBLE_DEBUG_SERVER_URL = line.slice('DEBUG_SERVER_URL='.length).trim();
  }
} catch {}

function bibleDebugReport({ hypothesisId, location, msg, data }) {
  if (!BIBLE_DEBUG_SERVER_URL) return;
  try {
    fetch(BIBLE_DEBUG_SERVER_URL, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: BIBLE_DEBUG_SESSION_ID,
        runId: BIBLE_DEBUG_RUN_ID,
        hypothesisId,
        location,
        msg,
        data: data && typeof data === 'object' ? data : { value: data },
        ts: Date.now()
      })
    }).catch(() => {});
  } catch {}
}
// #endregion

function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {}
}

function uniqueName(ext) {
  const id = (() => {
    try {
      return crypto.randomUUID();
    } catch {
      return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    }
  })();
  const safeExt = ext && ext.startsWith('.') ? ext : '';
  return `${id}${safeExt}`;
}

function normalizeOutputPath(outputPath) {
  const raw = String(outputPath || '/display').trim();
  const pathOnly = raw.split('?')[0];
  return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
}

function isLocalOutputUrl(urlString) {
  try {
    const u = new URL(urlString);
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false;
    if (Number(u.port) !== serverPort) return false;
    return Object.prototype.hasOwnProperty.call(OUTPUT_TITLES, u.pathname);
  } catch {
    return false;
  }
}

function openOutputInNewWindow(outputPath) {
  const pathOnly = normalizeOutputPath(outputPath);
  const url = `http://localhost:${serverPort}${pathOnly}`;

  const existing = outputWindows.get(pathOnly);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    if (existing.webContents.getURL() !== url) {
      existing.loadURL(url);
    }
    return { ok: true, reused: true };
  }

  const isStream = pathOnly === '/stream';
  const v = app.getVersion();
  const win = new BrowserWindow({
    width: pathOnly === '/display' || isStream ? 1920 : 1280,
    height: pathOnly === '/display' || isStream ? 1080 : 720,
    backgroundColor: isStream ? '#0f1419' : '#0f1419',
    title: `${OUTPUT_TITLES[pathOnly] || 'Pulpit Flow Pro Output'} · v${v}`,
    autoHideMenuBar: true,
    icon: APP_ICON_PNG,
    webPreferences: {
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  win.loadURL(url);
  outputWindows.set(pathOnly, win);
  win.on('closed', () => outputWindows.delete(pathOnly));
  return { ok: true, reused: false };
}

function setupOutputWindowHandler() {
  if (!mainWindow) return;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocalOutputUrl(url)) {
      return { action: 'deny' };
    }
    const u = new URL(url);
    const v = app.getVersion();
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: u.pathname === '/display' || u.pathname === '/stream' ? 1920 : 1280,
        height: u.pathname === '/display' || u.pathname === '/stream' ? 1080 : 720,
        backgroundColor: '#0f1419',
        title: `${OUTPUT_TITLES[u.pathname] || 'Pulpit Flow Pro Output'} · v${v}`,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          webSecurity: true
        }
      }
    };
  });
}

function createWindow() {
  const v = app.getVersion();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: `Pulpit Flow Pro · v${v}`,
    icon: APP_ICON_PNG,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
      webSecurity: true
    }
  });

  setupOutputWindowHandler();

  const startUrl = isDev
    ? (process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173')
    : `file://${path.join(__dirname, '../ui-dist/index.html')}`;

  // #region debug-point D:main-window-events
  mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) =>
    PFP_DEBUG && fetch(DEBUG_SERVER_URL, { method: 'POST', body: JSON.stringify({ sessionId: DEBUG_SESSION_ID, runId: DEBUG_RUN_ID, hypothesisId: 'D', location: 'electron/main.js:did-fail-load', msg: '[DEBUG] did-fail-load', data: { errorCode, errorDescription, validatedURL, isMainFrame, startUrl }, ts: Date.now() }) }).catch(() => {})
  );
  mainWindow.webContents.on('render-process-gone', (_e, details) =>
    PFP_DEBUG && fetch(DEBUG_SERVER_URL, { method: 'POST', body: JSON.stringify({ sessionId: DEBUG_SESSION_ID, runId: DEBUG_RUN_ID, hypothesisId: 'D', location: 'electron/main.js:render-process-gone', msg: '[DEBUG] render-process-gone', data: details || {}, ts: Date.now() }) }).catch(() => {})
  );
  mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) =>
    PFP_DEBUG && fetch(DEBUG_SERVER_URL, { method: 'POST', body: JSON.stringify({ sessionId: DEBUG_SESSION_ID, runId: DEBUG_RUN_ID, hypothesisId: 'A', location: 'electron/main.js:console-message', msg: '[DEBUG] renderer console-message', data: { level, message, line, sourceId }, ts: Date.now() }) }).catch(() => {})
  );
  // #endregion

  // #region debug-point B:start-url
  PFP_DEBUG && fetch(DEBUG_SERVER_URL, { method: 'POST', body: JSON.stringify({ sessionId: DEBUG_SESSION_ID, runId: DEBUG_RUN_ID, hypothesisId: 'B', location: 'electron/main.js:createWindow', msg: '[DEBUG] createWindow startUrl computed', data: { isDev, isPackaged: app.isPackaged, startUrl, appPath: app.getAppPath?.(), resourcesPath: process.resourcesPath, cwd: process.cwd() }, ts: Date.now() }) }).catch(() => {});
  // #endregion

  mainWindow.loadURL(startUrl);

  if (isDev && process.env.PFP_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  try {
    // #region debug-point A:app-ready
    PFP_DEBUG && fetch(DEBUG_SERVER_URL, { method: 'POST', body: JSON.stringify({ sessionId: DEBUG_SESSION_ID, runId: DEBUG_RUN_ID, hypothesisId: 'A', location: 'electron/main.js:ready', msg: '[DEBUG] app ready', data: { isDev: !app.isPackaged, isPackaged: app.isPackaged, node: process.versions?.node, electron: process.versions?.electron, chrome: process.versions?.chrome, appPath: app.getAppPath?.(), resourcesPath: process.resourcesPath, userData: app.getPath('userData') }, ts: Date.now() }) }).catch(() => {});
    // #endregion

    if (!app.isPackaged) {
      process.env.PFP_DB_PATH = path.join(process.cwd(), '.pfp-dev', 'pulpit-flow-pro.db');
      process.env.PFP_MEDIA_DIR = path.join(process.cwd(), '.pfp-dev', 'media');
    } else {
      process.env.PFP_MEDIA_DIR = path.join(app.getPath('userData'), 'media');
    }
    ensureDir(process.env.PFP_MEDIA_DIR);
    // Initialize database
    const db = await getDatabase();
    log('✓ Database initialized');

    try {
      const kjvCount = db.prepare('SELECT COUNT(*) as c FROM bible_verses WHERE translation = ?').get('KJV')?.c ?? 0;
      if (kjvCount < 1000) {
        const bibleDir = app.isPackaged ? path.join(process.resourcesPath, 'bibles') : process.cwd();
        const xmlFiles = fs.existsSync(bibleDir)
          ? fs
              .readdirSync(bibleDir)
              .filter((f) => f.toLowerCase().endsWith('.xml'))
              .map((f) => path.join(bibleDir, f))
          : [];
        if (xmlFiles.length) {
          const files = xmlFiles.map((filePath) => ({
            filePath,
            translation: guessTranslationFromFilename(filePath)
          }));
          const results = await importBibleXmlFiles({ db, files });
          const ok = results.filter((r) => r?.ok).length;
          log(`✓ Auto-imported ${ok} Bible XML file(s)`);
        }
      }
    } catch (e) {
      if (isDev) console.warn('Bible auto-import skipped:', e.message);
    }

    // Start Express + WebSocket server
    serverPort = (await startServer(db)) || 3000;
    log(`✓ Server started on localhost:${serverPort}`);

    // #region debug-point E:server-started
    PFP_DEBUG && fetch(DEBUG_SERVER_URL, { method: 'POST', body: JSON.stringify({ sessionId: DEBUG_SESSION_ID, runId: DEBUG_RUN_ID, hypothesisId: 'E', location: 'electron/main.js:server-started', msg: '[DEBUG] server started', data: { serverPort, mediaDir: process.env.PFP_MEDIA_DIR, dbPath: process.env.PFP_DB_PATH || '' }, ts: Date.now() }) }).catch(() => {});
    // #endregion

    ipcMain.on('pfp-get-server-port', (event) => {
      event.returnValue = serverPort;
    });

    ipcMain.on('pfp-get-app-version', (event) => {
      event.returnValue = app.getVersion();
    });

    ipcMain.handle('open-output-window', async (_event, outputPath) => {
      try {
        return openOutputInNewWindow(outputPath);
      } catch (error) {
        return { ok: false, error: error?.message || 'Failed to open output window' };
      }
    });

    // Create main window
    createWindow();
    log('✓ Pulpit Flow Pro ready');
  } catch (error) {
    console.error('❌ Failed to start app:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('will-quit', async () => {
  console.log('Shutting down...');
  await stopServer();
  closeDatabase();
  console.log('✓ Server stopped');
});

// IPC Handlers
ipcMain.handle('search-verse', async (event, reference, translation) => {
  try {
    const response = await fetch(`http://localhost:${serverPort}/api/verse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, translation })
    });
    return await response.json();
  } catch (error) {
    console.error('Verse search error:', error);
    throw error;
  }
});

ipcMain.handle('get-verses', async (event, references) => {
  try {
    const response = await fetch(`http://localhost:${serverPort}/api/verses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ references })
    });
    return await response.json();
  } catch (error) {
    console.error('Get verses error:', error);
    throw error;
  }
});

ipcMain.handle('select-bible-xml-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select Bible XML files',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'XML', extensions: ['xml'] }]
  });
  if (result.canceled) return [];
  // #region debug-point BI1:selected-files
  bibleDebugReport({
    hypothesisId: 'H1',
    location: 'electron/main.js:select-bible-xml-files',
    msg: 'user selected bible xml files',
    data: { count: (result.filePaths || []).length, files: (result.filePaths || []).slice(0, 5) }
  });
  // #endregion
  return result.filePaths || [];
});

ipcMain.handle('import-bible-xml-files', async (event, files) => {
  const db = await getDatabase();
  // #region debug-point BI2:ipc-import-start
  bibleDebugReport({
    hypothesisId: 'H1',
    location: 'electron/main.js:import-bible-xml-files',
    msg: 'ipc import requested',
    data: { count: Array.isArray(files) ? files.length : 0, sample: Array.isArray(files) ? files.slice(0, 5) : null }
  });
  const t0 = Date.now();
  // #endregion
  const normalized = Array.isArray(files)
    ? files
        .map((f) => ({
          filePath: f?.filePath,
          translation:
            typeof f?.translation === 'string' && f.translation.trim()
              ? f.translation
              : guessTranslationFromFilename(f?.filePath || '') || null
        }))
        .filter((f) => typeof f.filePath === 'string' && f.filePath.trim())
    : [];
  // #region debug-point BI3:ipc-import-normalized
  bibleDebugReport({
    hypothesisId: 'H3',
    location: 'electron/main.js:import-bible-xml-files',
    msg: 'ipc import normalized',
    data: { normalizedCount: normalized.length, sample: normalized.slice(0, 5) }
  });
  // #endregion
  const results = await importBibleXmlFiles({ db, files: normalized });
  // #region debug-point BI4:ipc-import-done
  bibleDebugReport({
    hypothesisId: 'H4',
    location: 'electron/main.js:import-bible-xml-files',
    msg: 'ipc import finished',
    data: { ok: results.filter((r) => r?.ok).length, total: results.length, ms: Date.now() - t0 }
  });
  // #endregion
  return results;
});

ipcMain.handle('select-media-files', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select background media',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov'] }]
  });
  if (result.canceled) return [];
  return result.filePaths || [];
});

ipcMain.handle('import-media-files', async (event, filePaths) => {
  const mediaDir = process.env.PFP_MEDIA_DIR;
  if (!mediaDir) return [];
  ensureDir(mediaDir);
  const list = Array.isArray(filePaths) ? filePaths.filter((p) => typeof p === 'string' && p.length) : [];
  if (list.length === 0) return [];

  const db = await getDatabase();
  const insert = db.prepare('INSERT INTO media_items (name, type, file_name) VALUES (?, ?, ?)');

  const results = [];
  for (const srcPath of list) {
    const ext = path.extname(srcPath || '').toLowerCase();
    const base = path.basename(srcPath, ext);
    const isVideo = ['.mp4', '.webm', '.mov'].includes(ext);
    const type = isVideo ? 'video' : 'image';
    const fileName = uniqueName(ext);
    const destPath = path.join(mediaDir, fileName);
    await fs.promises.copyFile(srcPath, destPath);
    const info = insert.run(base || fileName, type, fileName);
    results.push({
      id: Number(info.lastInsertRowid),
      name: base || fileName,
      type,
      fileName,
      url: `/media/${fileName}`
    });
  }

  return results;
});

ipcMain.handle('export-plan-json', async (event, planId) => {
  const id = Number(planId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Invalid plan id' };
  const res = await fetch(`http://localhost:${serverPort}/api/plans/${id}/export`).catch(() => null);
  if (!res || !res.ok) return { ok: false, error: 'Failed to export plan' };
  const payload = await res.json().catch(() => null);
  if (!payload) return { ok: false, error: 'Failed to export plan' };

  const dialogRes = await dialog.showSaveDialog({
    title: 'Export Service Plan',
    defaultPath: `service-plan-${id}.pfp`,
    filters: [{ name: 'PFP Plan', extensions: ['pfp', 'json'] }]
  });
  if (dialogRes.canceled || !dialogRes.filePath) return { ok: false, canceled: true };

  await fs.promises.writeFile(dialogRes.filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, filePath: dialogRes.filePath };
});

ipcMain.handle('import-plan-json', async () => {
  const dialogRes = await dialog.showOpenDialog({
    title: 'Import Service Plan',
    properties: ['openFile'],
    filters: [{ name: 'PFP Plan', extensions: ['pfp', 'json'] }]
  });
  if (dialogRes.canceled || !dialogRes.filePaths?.[0]) return { ok: false, canceled: true };
  const filePath = dialogRes.filePaths[0];
  const content = await fs.promises.readFile(filePath, 'utf8');
  const parsed = JSON.parse(content);

  const res = await fetch(`http://localhost:${serverPort}/api/plans/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed)
  }).catch(() => null);
  const data = res ? await res.json().catch(() => ({})) : {};
  if (!res || !res.ok) return { ok: false, error: data?.error || 'Import failed' };
  return { ok: true, id: Number(data.id) };
});
