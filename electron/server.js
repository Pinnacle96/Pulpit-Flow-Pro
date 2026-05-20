import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import { getSetting, setSetting } from './database.js';
import { announcementWriter, getAiStatus, lyricCleaner, relatedPassages, scriptureSuggester, sermonToSlides, setOpenAIKey } from './ai.js';
import { importBibleXmlTextItems } from './bibleImport.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let httpServer;
let wss;
let app;
let bibleService;
let dbRef;
let serverPort = 3000;
const DEV = process.env.NODE_ENV !== 'production';
const log = (...args) => {
  if (DEV) console.log(...args);
};

// #region debug-point R0:debug-reporter
const DEBUG_SESSION_ID = 'remote-ip-freeze';
let DEBUG_SERVER_URL = '';
let DEBUG_RUN_ID = process.env.PFP_DEBUG_RUN_ID || 'pre';
try {
  const candidates = [
    path.join(process.cwd(), '.dbg', `${DEBUG_SESSION_ID}.env`),
    process.env.APPDATA ? path.join(process.env.APPDATA, 'pulpit-flow-pro', '.dbg', `${DEBUG_SESSION_ID}.env`) : ''
  ].filter(Boolean);
  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const raw = fs.readFileSync(envPath, 'utf8');
    const line = raw.split(/\r?\n/).find((l) => l.startsWith('DEBUG_SERVER_URL='));
    if (line) {
      DEBUG_SERVER_URL = line.slice('DEBUG_SERVER_URL='.length).trim();
      break;
    }
  }
} catch {}

function debugReport({ hypothesisId, location, msg, data }) {
  if (!DEBUG_SERVER_URL) return;
  try {
    fetch(DEBUG_SERVER_URL, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: DEBUG_SESSION_ID,
        runId: DEBUG_RUN_ID,
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

// #region debug-point BB0:debug-reporter
const BIBLE_DEBUG_SESSION_ID = 'bible-import-hang';
let BIBLE_DEBUG_SERVER_URL = '';
let BIBLE_DEBUG_RUN_ID = process.env.PFP_BIBLE_DEBUG_RUN_ID || process.env.PFP_DEBUG_RUN_ID || 'pre';
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
let serverState = {
  goLive: false,
  theme: {
    themeName: 'Worship',
    primaryColor: '#1B2A4A',
    secondaryColor: '#C9A84C',
    backgroundUrl: null,
    fontFamily: 'Open Sans',
    overrides: {}
  },
  streamMode: 'lower',
  freeze: {
    display: false,
    stream: false,
    stage: false,
    preacher: false
  },
  timer: {
    running: false,
    label: '',
    durationMs: 0,
    remainingMs: 0,
    startedAt: 0
  },
  announcementPlaylist: {
    running: false,
    index: 0,
    nextAt: 0,
    ids: []
  },
  mediaPlaylist: {
    running: false,
    index: 0,
    nextAt: 0,
    ids: [],
    intervalSec: 8
  },
  preacherVerse: null,
  preacherNote: null,
  currentMessage: { type: 'DISPLAY_CLEAR', payload: {} },
  history: [],
  cursor: -1
};
let timerInterval = null;
let playlistInterval = null;

const BOOKS = [
  'Genesis',
  'Exodus',
  'Leviticus',
  'Numbers',
  'Deuteronomy',
  'Joshua',
  'Judges',
  'Ruth',
  '1 Samuel',
  '2 Samuel',
  '1 Kings',
  '2 Kings',
  '1 Chronicles',
  '2 Chronicles',
  'Ezra',
  'Nehemiah',
  'Esther',
  'Job',
  'Psalms',
  'Proverbs',
  'Ecclesiastes',
  'Song of Solomon',
  'Isaiah',
  'Jeremiah',
  'Lamentations',
  'Ezekiel',
  'Daniel',
  'Hosea',
  'Joel',
  'Amos',
  'Obadiah',
  'Jonah',
  'Micah',
  'Nahum',
  'Habakkuk',
  'Zephaniah',
  'Haggai',
  'Zechariah',
  'Malachi',
  'Matthew',
  'Mark',
  'Luke',
  'John',
  'Acts',
  'Romans',
  '1 Corinthians',
  '2 Corinthians',
  'Galatians',
  'Ephesians',
  'Philippians',
  'Colossians',
  '1 Thessalonians',
  '2 Thessalonians',
  '1 Timothy',
  '2 Timothy',
  'Titus',
  'Philemon',
  'Hebrews',
  'James',
  '1 Peter',
  '2 Peter',
  '1 John',
  '2 John',
  '3 John',
  'Jude',
  'Revelation'
];

export class BibleService {
  constructor(db) {
    this.db = db;
  }

  searchVerse(reference, translation = 'KJV') {
    const match = reference.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?(?:\s+([A-Za-z0-9]+))?$/);
    
    if (!match) {
      throw new Error('Invalid verse format. Use "John 3:16" or "John 3:16-18"');
    }

    const [, bookName, chapter, startVerse, endVerse, trailingTranslation] = match;
    const book = this.normalizeBookName(bookName);
    const chapterNum = parseInt(chapter);
    const startVerseNum = parseInt(startVerse);
    const endVerseNum = endVerse ? parseInt(endVerse) : startVerseNum;
    const effectiveTranslation = translation || trailingTranslation || 'KJV';

    try {
      const stmt = this.db.prepare(
        `SELECT id, book, chapter, verse, text, translation
         FROM bible_verses
         WHERE book = ? AND chapter = ? AND verse >= ? AND verse <= ? AND translation = ?
         ORDER BY verse`
      );
      const rows = stmt.all(book, chapterNum, startVerseNum, endVerseNum, effectiveTranslation);
      const verses = rows.map((r) => ({
        id: r.id,
        book: r.book,
        chapter: r.chapter,
        verse: r.verse,
        text: r.text,
        translation: r.translation
      }));

      if (verses.length === 0) {
        const available = this.db
          .prepare(`SELECT DISTINCT book FROM bible_verses WHERE translation = ? ORDER BY book`)
          .all(effectiveTranslation)
          .map((r) => r.book);
        throw new Error(
          `Verse not found: "${reference}" in ${effectiveTranslation}. ` +
            `Loaded books for ${effectiveTranslation}: ${available.length ? available.join(', ') : 'None'}`
        );
      }

      return {
        reference: `${book} ${chapter}:${startVerse}${endVerse ? '-' + endVerse : ''}`.trim(),
        translation: effectiveTranslation,
        text: verses.map(v => v.text).join(' '),
        verses: verses
      };
    } catch (error) {
      if (DEV) console.error('Verse search error:', { reference, translation: effectiveTranslation, normalizedBook: book, chapter: chapterNum, error: error.message });
      throw error;
    }
  }

  getVerses(references) {
    return references.map(ref => this.searchVerse(ref.reference, ref.translation || 'KJV'));
  }

  normalizeBookName(name) {
    const raw = String(name || '').trim().toLowerCase();
    const cleaned = raw.replace(/\./g, '').replace(/\s+/g, ' ').trim();
    const key = cleaned.replace(/\s+/g, '');

    const aliases = {
      gn: 'Genesis',
      ex: 'Exodus',
      lev: 'Leviticus',
      num: 'Numbers',
      deut: 'Deuteronomy',
      jos: 'Joshua',
      jdg: 'Judges',
      ru: 'Ruth',
      ps: 'Psalms',
      pr: 'Proverbs',
      eccl: 'Ecclesiastes',
      sos: 'Song of Solomon',
      song: 'Song of Solomon',
      isa: 'Isaiah',
      jer: 'Jeremiah',
      lam: 'Lamentations',
      ezek: 'Ezekiel',
      dan: 'Daniel',
      hos: 'Hosea',
      ob: 'Obadiah',
      jon: 'Jonah',
      mic: 'Micah',
      nah: 'Nahum',
      hab: 'Habakkuk',
      zeph: 'Zephaniah',
      hag: 'Haggai',
      zech: 'Zechariah',
      mal: 'Malachi',
      mt: 'Matthew',
      mk: 'Mark',
      lk: 'Luke',
      jn: 'John',
      jhn: 'John',
      act: 'Acts',
      rom: 'Romans',
      ro: 'Romans',
      gal: 'Galatians',
      eph: 'Ephesians',
      phil: 'Philippians',
      php: 'Philippians',
      col: 'Colossians',
      thess: '1 Thessalonians',
      tim: '1 Timothy',
      tit: 'Titus',
      phlm: 'Philemon',
      heb: 'Hebrews',
      jas: 'James',
      jam: 'James',
      pet: '1 Peter',
      rev: 'Revelation'
    };

    if (aliases[key]) return aliases[key];

    for (const book of BOOKS) {
      const bookKey = book.toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
      if (bookKey === key) return book;
      if (bookKey.startsWith(key)) return book;
    }

    return this.capitalizeBook(cleaned);
  }

  capitalizeBook(name) {
    // If not in map, try to capitalize properly
    return name
      .trim()
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
}

function broadcast(message) {
  if (!wss) return;
  const payload = JSON.stringify({
    type: message.type,
    payload: message.payload ?? {},
    timestamp: Date.now()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(payload);
  });
}

function send(ws, message) {
  if (!ws || ws.readyState !== 1) return;
  ws.send(
    JSON.stringify({
      type: message.type,
      payload: message.payload ?? {},
      timestamp: Date.now()
    })
  );
}

function shouldGate(type) {
  return (
    type === 'DISPLAY_VERSE' ||
    type === 'DISPLAY_LYRICS' ||
    type === 'DISPLAY_SLIDE'
  );
}

function safeParseJson(value, fallback) {
  try {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    return JSON.parse(trimmed);
  } catch {
    return fallback;
  }
}

function sanitizeThemeShape(input) {
  const t = input && typeof input === 'object' ? input : {};
  const out = {};
  if (typeof t.themeName === 'string') out.themeName = t.themeName;
  if (typeof t.primaryColor === 'string') out.primaryColor = t.primaryColor;
  if (typeof t.secondaryColor === 'string') out.secondaryColor = t.secondaryColor;
  if (Object.prototype.hasOwnProperty.call(t, 'backgroundUrl')) {
    out.backgroundUrl = t.backgroundUrl ? String(t.backgroundUrl) : null;
  }
  if (typeof t.fontFamily === 'string') out.fontFamily = t.fontFamily;
  return out;
}

function sanitizeThemeOverrides(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const allowed = ['display', 'stream', 'stage', 'preacher'];
  const out = {};
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const next = sanitizeThemeShape(raw[key]);
    if (Object.keys(next).length === 0) continue;
    out[key] = next;
  }
  return out;
}

function applyMessageToState(message) {
  if (message.type === 'GO_LIVE') {
    serverState.goLive = !!message.payload?.live;
    return;
  }

  if (message.type === 'STREAM_MODE') {
    const mode = String(message.payload?.mode || '').trim().toLowerCase();
    const next = mode === 'full' ? 'full' : 'lower';
    serverState.streamMode = next;
    setSetting('stream_mode', next);
    return;
  }

  if (message.type === 'PREACHER_VERSE') {
    serverState.preacherVerse = { type: 'PREACHER_VERSE', payload: message.payload ?? {} };
    return;
  }

  if (message.type === 'PREACHER_NOTE') {
    serverState.preacherNote = message.payload ?? {};
    return;
  }

  if (message.type === 'THEME_CHANGE') {
    const payload = message.payload || {};
    const incomingOverrides = Object.prototype.hasOwnProperty.call(payload, 'overrides')
      ? sanitizeThemeOverrides(payload.overrides)
      : serverState.theme?.overrides || {};
    const nextTheme = {
      themeName: payload?.themeName ?? serverState.theme.themeName,
      primaryColor: payload?.primaryColor ?? serverState.theme.primaryColor,
      secondaryColor: payload?.secondaryColor ?? serverState.theme.secondaryColor,
      backgroundUrl: payload?.backgroundUrl ?? serverState.theme.backgroundUrl,
      fontFamily: payload?.fontFamily ?? serverState.theme.fontFamily,
      overrides: incomingOverrides
    };
    serverState.theme = nextTheme;
    if (typeof payload?.primaryColor === 'string') setSetting('primary_color', nextTheme.primaryColor);
    if (typeof payload?.secondaryColor === 'string') setSetting('secondary_color', nextTheme.secondaryColor);
    if (Object.prototype.hasOwnProperty.call(payload || {}, 'backgroundUrl')) {
      setSetting('background_url', nextTheme.backgroundUrl ? String(nextTheme.backgroundUrl) : '');
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, 'fontFamily')) {
      setSetting('font_family', nextTheme.fontFamily ? String(nextTheme.fontFamily) : '');
    }
    if (Object.prototype.hasOwnProperty.call(payload || {}, 'overrides')) {
      setSetting('theme_overrides', JSON.stringify(incomingOverrides));
    }
    return;
  }

  if (message.type === 'OUTPUT_FREEZE') {
    const p = message.payload || {};
    if (typeof p.target === 'string') {
      const target = p.target;
      if (Object.prototype.hasOwnProperty.call(serverState.freeze, target)) {
        serverState.freeze[target] = !!p.frozen;
      }
    } else {
      for (const k of Object.keys(serverState.freeze)) {
        if (Object.prototype.hasOwnProperty.call(p, k)) serverState.freeze[k] = !!p[k];
      }
    }
    return;
  }

  if (
    message.type === 'DISPLAY_VERSE' ||
    message.type === 'DISPLAY_LYRICS' ||
    message.type === 'DISPLAY_SLIDE' ||
    message.type === 'DISPLAY_BLANK' ||
    message.type === 'DISPLAY_CLEAR'
  ) {
    if (message.type === 'DISPLAY_SLIDE' && message.payload?.overlayOnly) return;
    serverState.currentMessage = { type: message.type, payload: message.payload ?? {} };
    serverState.history = serverState.history.slice(0, serverState.cursor + 1);
    serverState.history.push(serverState.currentMessage);
    serverState.cursor = serverState.history.length - 1;
  }
}

function moveCursor(delta) {
  if (serverState.history.length === 0) return { type: 'DISPLAY_CLEAR', payload: {} };
  const next = Math.max(0, Math.min(serverState.history.length - 1, serverState.cursor + delta));
  serverState.cursor = next;
  serverState.currentMessage = serverState.history[next];
  return serverState.currentMessage;
}

function getTimerSnapshot() {
  const t = serverState.timer || {};
  let remainingMs = Number.isFinite(t.remainingMs) ? t.remainingMs : 0;
  const durationMs = Number.isFinite(t.durationMs) ? t.durationMs : 0;
  const startedAt = Number.isFinite(t.startedAt) ? t.startedAt : 0;
  const running = !!t.running;
  if (running) {
    remainingMs = Math.max(0, durationMs - (Date.now() - startedAt));
  }
  return {
    running,
    label: typeof t.label === 'string' ? t.label : '',
    durationMs,
    remainingMs,
    startedAt
  };
}

function broadcastTimer() {
  const snapshot = getTimerSnapshot();
  serverState.timer = snapshot;
  broadcast({ type: 'TIMER_UPDATE', payload: snapshot });
  if (snapshot.running && snapshot.remainingMs <= 0) {
    serverState.timer = { ...snapshot, running: false, remainingMs: 0 };
    broadcast({ type: 'TIMER_UPDATE', payload: serverState.timer });
  }
}

function tickAnnouncementPlaylist() {
  const pl = serverState.announcementPlaylist || {};
  if (!pl.running) return;
  const ids = Array.isArray(pl.ids) ? pl.ids : [];
  if (ids.length === 0) {
    serverState.announcementPlaylist = { running: false, index: 0, nextAt: 0, ids: [] };
    return;
  }
  const now = Date.now();
  if (Number.isFinite(pl.nextAt) && pl.nextAt > now) return;

  const idx = Number.isFinite(pl.index) ? pl.index : 0;
  const id = Number(ids[idx % ids.length]);
  if (!dbRef || !Number.isFinite(id) || id <= 0) {
    serverState.announcementPlaylist = { ...pl, index: idx + 1, nextAt: now + 1000 };
    return;
  }

  let row = null;
  try {
    row = dbRef.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
  } catch {}
  if (!row) {
    serverState.announcementPlaylist = { ...pl, index: idx + 1, nextAt: now + 1000 };
    return;
  }

  const duration = Number(row.duration_sec) || 10;
  const message = {
    type: 'DISPLAY_SLIDE',
    payload: {
      title: row.title || '',
      body: row.body || '',
      background: row.background_url || null,
      duration,
      type: 'announcement'
    }
  };
  applyMessageToState(message);
  if (serverState.goLive) broadcast(message);
  serverState.announcementPlaylist = { ...pl, index: idx + 1, nextAt: now + duration * 1000, ids };
}

function tickMediaPlaylist() {
  const pl = serverState.mediaPlaylist || {};
  if (!pl.running) return;
  const ids = Array.isArray(pl.ids) ? pl.ids : [];
  if (ids.length === 0) {
    serverState.mediaPlaylist = { running: false, index: 0, nextAt: 0, ids: [], intervalSec: 8 };
    return;
  }
  const now = Date.now();
  if (Number.isFinite(pl.nextAt) && pl.nextAt > now) return;

  const idx = Number.isFinite(pl.index) ? pl.index : 0;
  const id = Number(ids[idx % ids.length]);
  if (!dbRef || !Number.isFinite(id) || id <= 0) {
    serverState.mediaPlaylist = { ...pl, index: idx + 1, nextAt: now + 1000 };
    return;
  }

  let row = null;
  try {
    row = dbRef.prepare('SELECT * FROM media_items WHERE id = ?').get(id);
  } catch {}
  if (!row) {
    serverState.mediaPlaylist = { ...pl, index: idx + 1, nextAt: now + 1000 };
    return;
  }

  const intervalSec = Math.max(2, Math.floor(Number(pl.intervalSec) || 8));
  const url = `/media/${row.file_name}`;
  const isVideo = String(row.type || '').toLowerCase() === 'video';
  const message = {
    type: 'DISPLAY_SLIDE',
    payload: isVideo
      ? { type: 'video', title: '', body: '', background: url, state: 'play' }
      : { type: 'media', title: '', body: '', background: url }
  };
  applyMessageToState(message);
  if (serverState.goLive) broadcast(message);
  serverState.mediaPlaylist = { ...pl, index: idx + 1, nextAt: now + intervalSec * 1000, ids, intervalSec };
}

function tickPlaylists() {
  tickAnnouncementPlaylist();
  tickMediaPlaylist();
}

function getLocalIPv4() {
  const ifaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, list] of Object.entries(ifaces)) {
    for (const addr of list || []) {
      if (addr.family !== 'IPv4' || addr.internal) continue;
      const ip = String(addr.address || '').trim();
      const netmask = String(addr.netmask || '').trim();
      if (!ip) continue;
      if (netmask === '255.255.255.255') continue;
      candidates.push({ name: String(name || ''), ip, netmask });
    }
  }

  if (!candidates.length) return null;

  const score = (c) => {
    const n = c.name.toLowerCase();
    let s = 0;
    if (/warp|cloudflare/.test(n)) s -= 50;
    if (/wsl|vethernet|hyper-v|virtual|vmware|vbox|loopback/.test(n)) s -= 40;
    if (/wi-?fi|wlan/.test(n)) s += 30;
    if (/ethernet/.test(n)) s += 20;
    if (c.ip.startsWith('10.') || c.ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(c.ip)) s += 5;
    return s;
  };

  candidates.sort((a, b) => score(b) - score(a));
  // #region debug-point R1:network-ip-choice
  debugReport({
    hypothesisId: 'H1',
    location: 'electron/server.js:getLocalIPv4',
    msg: 'network interface selection',
    data: {
      candidates,
      chosen: candidates[0],
      scores: candidates.map((c) => ({ name: c.name, ip: c.ip, netmask: c.netmask, score: score(c) }))
    }
  });
  // #endregion
  return candidates[0].ip;
}

export async function startServer(db) {
  app = express();
  httpServer = createServer(app);
  wss = new WebSocketServer({ server: httpServer });
  dbRef = db;
  bibleService = new BibleService(db);

  const portRaw = (getSetting('server_port', '3000') || '3000').trim();
  const parsedPort = Number(portRaw);
  serverPort = Number.isFinite(parsedPort) && parsedPort >= 1 && parsedPort <= 65535 ? Math.floor(parsedPort) : 3000;

  serverState.goLive = (getSetting('go_live', 'false') || 'false') === 'true';
  serverState.streamMode = (getSetting('stream_mode', 'lower') || 'lower').trim().toLowerCase() === 'full' ? 'full' : 'lower';
  const backgroundUrlRaw = (getSetting('background_url', '') || '').trim();
  const overridesRaw = getSetting('theme_overrides', '{}');
  const overrides = sanitizeThemeOverrides(safeParseJson(overridesRaw, {}));
  serverState.theme = {
    themeName: 'Worship',
    primaryColor: getSetting('primary_color', '#1B2A4A') || '#1B2A4A',
    secondaryColor: getSetting('secondary_color', '#C9A84C') || '#C9A84C',
    backgroundUrl: backgroundUrlRaw ? backgroundUrlRaw : null,
    fontFamily: getSetting('font_family', 'Open Sans') || 'Open Sans',
    overrides
  };

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '350mb' }));
  app.use('/outputs', express.static(path.join(__dirname, '../outputs')));
  const mediaDir = process.env.PFP_MEDIA_DIR;
  if (mediaDir) {
    try {
      fs.mkdirSync(mediaDir, { recursive: true });
    } catch {}
    app.use('/media', express.static(mediaDir));
  }

  // WebSocket connection handler
  wss.on('connection', (ws) => {
    log('Client connected');

    send(ws, { type: 'THEME_CHANGE', payload: serverState.theme });
    send(ws, { type: 'GO_LIVE', payload: { live: serverState.goLive } });
    send(ws, { type: 'TIMER_UPDATE', payload: getTimerSnapshot() });
    send(ws, { type: 'STREAM_MODE', payload: { mode: serverState.streamMode } });
    send(ws, { type: 'OUTPUT_FREEZE', payload: serverState.freeze });
    if (serverState.preacherVerse) send(ws, serverState.preacherVerse);
    if (serverState.preacherNote) {
      send(ws, { type: 'PREACHER_NOTE', payload: serverState.preacherNote });
    }
    if (serverState.goLive) {
      send(ws, serverState.currentMessage);
    } else {
      send(ws, { type: 'DISPLAY_CLEAR', payload: {} });
    }

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);

        if (message?.type === 'PING') {
          send(ws, { type: 'PONG', payload: {} });
          return;
        }

        if (message?.type === 'REMOTE_COMMAND') {
          const cmd = typeof message.payload?.command === 'string' ? message.payload.command.trim().toUpperCase() : '';
          if (cmd === 'PREV') {
            broadcast({ type: 'REMOTE_NAV', payload: { delta: -1 } });
            return;
          }
          if (cmd === 'NEXT') {
            broadcast({ type: 'REMOTE_NAV', payload: { delta: 1 } });
            return;
          }
          if (cmd === 'WORSHIP_PREV') {
            broadcast({ type: 'REMOTE_ACTION', payload: { action: 'WORSHIP_PREV' } });
            return;
          }
          if (cmd === 'WORSHIP_NEXT') {
            broadcast({ type: 'REMOTE_ACTION', payload: { action: 'WORSHIP_NEXT' } });
            return;
          }
          if (cmd === 'PASTOR_PREV_SCRIPTURE') {
            broadcast({ type: 'REMOTE_ACTION', payload: { action: 'PASTOR_PREV_SCRIPTURE' } });
            return;
          }
          if (cmd === 'PASTOR_NEXT_SCRIPTURE') {
            broadcast({ type: 'REMOTE_ACTION', payload: { action: 'PASTOR_NEXT_SCRIPTURE' } });
            return;
          }
          if (cmd === 'BLANK_ALL') {
            const m = { type: 'DISPLAY_BLANK', payload: {} };
            applyMessageToState(m);
            broadcast(m);
            return;
          }
          if (cmd === 'CLEAR') {
            const m = { type: 'DISPLAY_CLEAR', payload: {} };
            applyMessageToState(m);
            broadcast(m);
            return;
          }
          if (cmd === 'TOGGLE_GO_LIVE') {
            const live = !serverState.goLive;
            setSetting('go_live', live ? 'true' : 'false');
            serverState.goLive = live;
            broadcast({ type: 'GO_LIVE', payload: { live } });
            if (live) {
              broadcast(serverState.currentMessage);
            } else {
              broadcast({ type: 'DISPLAY_CLEAR', payload: {} });
            }
            return;
          }
          return;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      log('Client disconnected');
    });
  });

  if (timerInterval) {
    try {
      clearInterval(timerInterval);
    } catch {}
  }
  timerInterval = setInterval(broadcastTimer, 1000);
  broadcastTimer();

  if (playlistInterval) {
    try {
      clearInterval(playlistInterval);
    } catch {}
  }
  playlistInterval = setInterval(tickPlaylists, 500);
  tickPlaylists();

  // Routes
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Display Output
  app.get('/display', (req, res) => {
    res.sendFile(path.join(__dirname, '../outputs/display.html'));
  });

  // Stream Overlay Output
  app.get('/stream', (req, res) => {
    res.sendFile(path.join(__dirname, '../outputs/stream.html'));
  });

  // Stage Monitor Output
  app.get('/stage', (req, res) => {
    res.sendFile(path.join(__dirname, '../outputs/stage.html'));
  });

  // Preacher Monitor Output
  app.get('/preacher', (req, res) => {
    res.sendFile(path.join(__dirname, '../outputs/preacher.html'));
  });

  // Remote Control
  app.get('/remote', (req, res) => {
    res.sendFile(path.join(__dirname, '../outputs/remote.html'));
  });

  // Preview Screen
  app.get('/preview', (req, res) => {
    res.sendFile(path.join(__dirname, '../outputs/preview.html'));
  });

  // API Routes
  app.post('/api/verse', (req, res) => {
    try {
      const { reference, translation = 'KJV', secondTranslation } = req.body;
      log(`Verse Search Request: "${reference}" (${translation})`);
      
      const verse = bibleService.searchVerse(reference, translation);
      const second = secondTranslation ? bibleService.searchVerse(reference, secondTranslation) : null;

      log(`Found verse: ${verse.reference}`);

      const message = {
        type: 'DISPLAY_VERSE',
        payload: {
          text: verse.text,
          reference: verse.reference,
          translation: verse.translation,
          secondText: second?.text,
          secondTranslation: second?.translation,
          theme: serverState.theme
        }
      };
      applyMessageToState(message);
      if (serverState.goLive) broadcast(message);

      res.json(verse);
    } catch (error) {
      console.error('❌ API /api/verse error:', error.message);
      res.status(400).json({ error: error.message });
    }
  });

  // Debug endpoint to check available verses
  app.get('/api/debug/verses', (req, res) => {
    try {
      const rows = db.prepare(`SELECT book, COUNT(*) as count FROM bible_verses GROUP BY book ORDER BY book`).all();
      res.json({ 
        total: rows.reduce((sum, v) => sum + v.count, 0),
        books: rows
      });
    } catch (error) {
      console.error('Debug endpoint error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/verses', (req, res) => {
    try {
      const { references } = req.body;
      const verses = bibleService.getVerses(references);
      res.json(verses);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/songs', (req, res) => {
    try {
      const q = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        const rows = db.prepare('SELECT * FROM songs ORDER BY updated_at DESC, created_at DESC, title ASC').all();
        return res.json(rows);
      }
      const like = `%${q}%`;
      const rows = db
        .prepare(
          `SELECT DISTINCT s.*
           FROM songs s
           LEFT JOIN song_sections ss ON ss.song_id = s.id
           WHERE s.title LIKE ? OR s.artist LIKE ? OR s.ccli_number LIKE ? OR ss.lyrics LIKE ?
           ORDER BY s.updated_at DESC, s.created_at DESC, s.title ASC`
        )
        .all(like, like, like, like);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/songs', (req, res) => {
    try {
      const body = req.body || {};
      if (!body.title || typeof body.title !== 'string') return res.status(400).json({ error: 'title is required' });

      const now = new Date().toISOString();
      const result = db
        .prepare(
          `INSERT INTO songs (title, artist, ccli_number, key_sig, tempo, tags, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          body.title.trim(),
          typeof body.artist === 'string' ? body.artist.trim() : null,
          typeof body.ccli_number === 'string' ? body.ccli_number.trim() : null,
          typeof body.key_sig === 'string' ? body.key_sig.trim() : null,
          typeof body.tempo === 'string' ? body.tempo.trim() : null,
          typeof body.tags === 'string' ? body.tags : null,
          now
        );
      res.json({ id: result.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/songs/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
      if (!song) return res.status(404).json({ error: 'Not found' });
      const sections = db.prepare('SELECT * FROM song_sections WHERE song_id = ? ORDER BY position ASC').all(id);
      res.json({ ...song, sections });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/songs/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT id FROM songs WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const body = req.body || {};
      const now = new Date().toISOString();
      db
        .prepare(
          `UPDATE songs
           SET title = ?, artist = ?, ccli_number = ?, key_sig = ?, tempo = ?, tags = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          typeof body.title === 'string' ? body.title.trim() : null,
          typeof body.artist === 'string' ? body.artist.trim() : null,
          typeof body.ccli_number === 'string' ? body.ccli_number.trim() : null,
          typeof body.key_sig === 'string' ? body.key_sig.trim() : null,
          typeof body.tempo === 'string' ? body.tempo.trim() : null,
          typeof body.tags === 'string' ? body.tags : null,
          now,
          id
        );
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/songs/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      db.prepare('DELETE FROM songs WHERE id = ?').run(id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/songs/:id/sections', (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT id FROM songs WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const sections = Array.isArray(req.body?.sections) ? req.body.sections : [];
      const trx = db.transaction(() => {
        db.prepare('DELETE FROM song_sections WHERE song_id = ?').run(id);
        const insert = db.prepare(
          `INSERT INTO song_sections (song_id, type, label, lyrics, chords, position, locked)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        );
        for (let i = 0; i < sections.length; i++) {
          const s = sections[i] || {};
          const type = typeof s.type === 'string' ? s.type : 'custom';
          const label = typeof s.label === 'string' ? s.label : `Section ${i + 1}`;
          insert.run(
            id,
            type,
            label,
            typeof s.lyrics === 'string' ? s.lyrics : null,
            typeof s.chords === 'string' ? s.chords : null,
            Number.isFinite(s.position) ? s.position : i,
            s.locked ? 1 : 0
          );
        }
        db.prepare('UPDATE songs SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id);
      });
      trx();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/announcements', (req, res) => {
    try {
      const q = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
      if (!q) {
        const rows = db.prepare('SELECT * FROM announcements ORDER BY updated_at DESC, created_at DESC, title ASC').all();
        return res.json(rows);
      }
      const like = `%${q}%`;
      const rows = db
        .prepare(
          `SELECT *
           FROM announcements
           WHERE title LIKE ? OR body LIKE ?
           ORDER BY updated_at DESC, created_at DESC, title ASC`
        )
        .all(like, like);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/announcements', (req, res) => {
    try {
      const body = req.body || {};
      if (!body.title || typeof body.title !== 'string') return res.status(400).json({ error: 'title is required' });
      if (!body.body || typeof body.body !== 'string') return res.status(400).json({ error: 'body is required' });
      const bg = typeof body.background_url === 'string' ? body.background_url.trim() : typeof body.backgroundUrl === 'string' ? body.backgroundUrl.trim() : '';
      const duration = Number.isFinite(body.duration_sec) ? body.duration_sec : Number.isFinite(body.durationSec) ? body.durationSec : null;
      const now = new Date().toISOString();
      const result = db
        .prepare('INSERT INTO announcements (title, body, background_url, duration_sec, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(body.title.trim(), body.body.trim(), bg || null, Number.isFinite(duration) ? duration : null, now);
      res.json({ id: result.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/announcements/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/announcements/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT id FROM announcements WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const body = req.body || {};
      const bg = typeof body.background_url === 'string' ? body.background_url.trim() : typeof body.backgroundUrl === 'string' ? body.backgroundUrl.trim() : '';
      const duration = Number.isFinite(body.duration_sec) ? body.duration_sec : Number.isFinite(body.durationSec) ? body.durationSec : null;
      const now = new Date().toISOString();
      db
        .prepare('UPDATE announcements SET title = ?, body = ?, background_url = ?, duration_sec = ?, updated_at = ? WHERE id = ?')
        .run(
          typeof body.title === 'string' ? body.title.trim() : null,
          typeof body.body === 'string' ? body.body.trim() : null,
          bg || null,
          Number.isFinite(duration) ? duration : null,
          now,
          id
        );
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/announcements/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      db.prepare('DELETE FROM announcements WHERE id = ?').run(id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/announcements/playlist', (req, res) => {
    const pl = serverState.announcementPlaylist || {};
    res.json({
      running: !!pl.running,
      index: Number.isFinite(pl.index) ? pl.index : 0,
      nextAt: Number.isFinite(pl.nextAt) ? pl.nextAt : 0,
      ids: Array.isArray(pl.ids) ? pl.ids : []
    });
  });

  app.post('/api/announcements/playlist', (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
      const start = !!req.body?.start;
      serverState.announcementPlaylist = {
        running: start && ids.length > 0,
        index: 0,
        nextAt: start ? 0 : Number.isFinite(serverState.announcementPlaylist?.nextAt) ? serverState.announcementPlaylist.nextAt : 0,
        ids
      };
      tickAnnouncementPlaylist();
      res.json({ ok: true, ...serverState.announcementPlaylist });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/announcements/playlist/start', (req, res) => {
    const pl = serverState.announcementPlaylist || {};
    const ids = Array.isArray(pl.ids) ? pl.ids : [];
    serverState.announcementPlaylist = { running: ids.length > 0, index: Number.isFinite(pl.index) ? pl.index : 0, nextAt: 0, ids };
    tickAnnouncementPlaylist();
    res.json({ ok: true, ...serverState.announcementPlaylist });
  });

  app.post('/api/announcements/playlist/stop', (req, res) => {
    const pl = serverState.announcementPlaylist || {};
    serverState.announcementPlaylist = { running: false, index: Number.isFinite(pl.index) ? pl.index : 0, nextAt: 0, ids: Array.isArray(pl.ids) ? pl.ids : [] };
    res.json({ ok: true, ...serverState.announcementPlaylist });
  });

  app.get('/api/media/playlist', (req, res) => {
    const pl = serverState.mediaPlaylist || {};
    res.json({
      running: !!pl.running,
      index: Number.isFinite(pl.index) ? pl.index : 0,
      nextAt: Number.isFinite(pl.nextAt) ? pl.nextAt : 0,
      intervalSec: Math.max(2, Math.floor(Number(pl.intervalSec) || 8)),
      ids: Array.isArray(pl.ids) ? pl.ids : []
    });
  });

  app.post('/api/media/playlist', (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0) : [];
      const start = !!req.body?.start;
      const intervalSec = Math.max(2, Math.floor(Number(req.body?.intervalSec) || Number(req.body?.interval_sec) || 8));
      serverState.mediaPlaylist = {
        running: start && ids.length > 0,
        index: 0,
        nextAt: start ? 0 : Number.isFinite(serverState.mediaPlaylist?.nextAt) ? serverState.mediaPlaylist.nextAt : 0,
        ids,
        intervalSec
      };
      tickMediaPlaylist();
      res.json({ ok: true, ...serverState.mediaPlaylist });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/media/playlist/start', (req, res) => {
    const pl = serverState.mediaPlaylist || {};
    const ids = Array.isArray(pl.ids) ? pl.ids : [];
    const intervalSec = Math.max(2, Math.floor(Number(pl.intervalSec) || 8));
    serverState.mediaPlaylist = { running: ids.length > 0, index: Number.isFinite(pl.index) ? pl.index : 0, nextAt: 0, ids, intervalSec };
    tickMediaPlaylist();
    res.json({ ok: true, ...serverState.mediaPlaylist });
  });

  app.post('/api/media/playlist/stop', (req, res) => {
    const pl = serverState.mediaPlaylist || {};
    serverState.mediaPlaylist = {
      running: false,
      index: Number.isFinite(pl.index) ? pl.index : 0,
      nextAt: 0,
      ids: Array.isArray(pl.ids) ? pl.ids : [],
      intervalSec: Math.max(2, Math.floor(Number(pl.intervalSec) || 8))
    };
    res.json({ ok: true, ...serverState.mediaPlaylist });
  });

  app.post('/api/media/import', async (req, res) => {
    try {
      const mediaDir = process.env.PFP_MEDIA_DIR;
      if (!mediaDir) return res.status(400).json({ error: 'Media directory not configured' });
      const list = Array.isArray(req.body?.items) ? req.body.items : [];
      if (list.length === 0) return res.status(400).json({ error: 'No items provided' });

      const insert = db.prepare('INSERT INTO media_items (name, type, file_name) VALUES (?, ?, ?)');
      const results = [];
      for (const it of list) {
        const name = typeof it?.name === 'string' ? it.name.trim() : '';
        const fileNameIn = typeof it?.fileName === 'string' ? it.fileName.trim() : '';
        const mime = typeof it?.mime === 'string' ? it.mime.trim().toLowerCase() : '';
        const base64 = typeof it?.dataBase64 === 'string' ? it.dataBase64.trim() : '';
        if (!base64) continue;
        const lowerName = fileNameIn.toLowerCase();
        const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(lowerName);
        const isVideo = mime.startsWith('video/') || /\.(mp4|webm|mov|ogg)$/.test(lowerName);
        if (!isImage && !isVideo) continue;

        const ext =
          fileNameIn.toLowerCase().endsWith('.png') ? '.png'
          : fileNameIn.toLowerCase().endsWith('.jpg') || fileNameIn.toLowerCase().endsWith('.jpeg') ? '.jpg'
          : fileNameIn.toLowerCase().endsWith('.webp') ? '.webp'
          : fileNameIn.toLowerCase().endsWith('.gif') ? '.gif'
          : fileNameIn.toLowerCase().endsWith('.mp4') ? '.mp4'
          : fileNameIn.toLowerCase().endsWith('.webm') ? '.webm'
          : fileNameIn.toLowerCase().endsWith('.mov') ? '.mov'
          : fileNameIn.toLowerCase().endsWith('.ogg') ? '.ogg'
          : mime === 'image/png' ? '.png'
          : mime === 'image/webp' ? '.webp'
          : mime === 'image/gif' ? '.gif'
          : mime === 'video/mp4' ? '.mp4'
          : mime === 'video/webm' ? '.webm'
          : mime === 'video/quicktime' ? '.mov'
          : mime === 'video/ogg' ? '.ogg'
          : '.jpg';

        const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}${ext}`;
        const destPath = path.join(mediaDir, unique);
        const buf = Buffer.from(base64, 'base64');
        const capBytes = isVideo ? 250 * 1024 * 1024 : 20 * 1024 * 1024;
        if (buf.length > capBytes) continue;
        await fs.promises.writeFile(destPath, buf);

        const type = isVideo ? 'video' : 'image';
        const info = insert.run(name || unique, type, unique);
        results.push({
          id: Number(info.lastInsertRowid),
          name: name || unique,
          type,
          fileName: unique,
          url: `/media/${unique}`
        });
      }

      if (!results.length) return res.status(400).json({ error: 'No valid media imported (or files too large)' });
      res.json({ ok: true, items: results });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/plans', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM service_plans ORDER BY service_date DESC, created_at DESC').all();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/plans', (req, res) => {
    try {
      const body = req.body || {};
      if (!body.title || typeof body.title !== 'string') return res.status(400).json({ error: 'title is required' });
      const result = db
        .prepare('INSERT INTO service_plans (title, service_date, template) VALUES (?, ?, ?)')
        .run(body.title.trim(), typeof body.service_date === 'string' ? body.service_date : null, body.template ? 1 : 0);
      res.json({ id: result.lastInsertRowid });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put('/api/plans/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT id FROM service_plans WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Not found' });
      const body = req.body || {};
      db
        .prepare('UPDATE service_plans SET title = ?, service_date = ?, template = ? WHERE id = ?')
        .run(
          typeof body.title === 'string' ? body.title.trim() : null,
          typeof body.service_date === 'string' ? body.service_date : null,
          body.template ? 1 : 0,
          id
        );
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/plans/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      db.prepare('DELETE FROM service_plans WHERE id = ?').run(id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/plans/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const plan = db.prepare('SELECT * FROM service_plans WHERE id = ?').get(id);
      if (!plan) return res.status(404).json({ error: 'Not found' });
      const blocks = db.prepare('SELECT * FROM service_blocks WHERE plan_id = ? ORDER BY position ASC').all(id);
      res.json({ ...plan, blocks });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/plans/:id/export', (req, res) => {
    try {
      const id = Number(req.params.id);
      const plan = db.prepare('SELECT * FROM service_plans WHERE id = ?').get(id);
      if (!plan) return res.status(404).json({ error: 'Not found' });
      const blocks = db.prepare('SELECT * FROM service_blocks WHERE plan_id = ? ORDER BY position ASC').all(id);
      res.json({
        format: 'pfp-plan-v1',
        exportedAt: new Date().toISOString(),
        plan: {
          title: plan.title,
          service_date: plan.service_date,
          template: !!plan.template
        },
        blocks
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/plans/import', (req, res) => {
    try {
      const body = req.body || {};
      const planIn = body.plan && typeof body.plan === 'object' ? body.plan : body;
      const title = typeof planIn.title === 'string' ? planIn.title.trim() : '';
      if (!title) return res.status(400).json({ error: 'title is required' });
      const serviceDate = typeof planIn.service_date === 'string' ? planIn.service_date : null;
      const template = planIn.template ? 1 : 0;
      const blocksIn = Array.isArray(body.blocks) ? body.blocks : Array.isArray(planIn.blocks) ? planIn.blocks : [];

      const trx = db.transaction(() => {
        const result = db
          .prepare('INSERT INTO service_plans (title, service_date, template) VALUES (?, ?, ?)')
          .run(title, serviceDate, template);
        const planId = Number(result.lastInsertRowid);
        const insert = db.prepare(
          `INSERT INTO service_blocks (plan_id, type, position, song_id, scripture_ref, custom_data, notes, completed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (let i = 0; i < blocksIn.length; i++) {
          const b = blocksIn[i] || {};
          insert.run(
            planId,
            typeof b.type === 'string' ? b.type : 'custom',
            Number.isFinite(b.position) ? b.position : i,
            Number.isFinite(b.song_id) ? b.song_id : null,
            typeof b.scripture_ref === 'string' ? b.scripture_ref : null,
            typeof b.custom_data === 'string' ? b.custom_data : null,
            typeof b.notes === 'string' ? b.notes : null,
            b.completed ? 1 : 0
          );
        }
        return planId;
      });

      const id = trx();
      res.json({ id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/plans/:id/blocks', (req, res) => {
    try {
      const id = Number(req.params.id);
      const plan = db.prepare('SELECT id FROM service_plans WHERE id = ?').get(id);
      if (!plan) return res.status(404).json({ error: 'Not found' });
      const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : [];
      const trx = db.transaction(() => {
        db.prepare('DELETE FROM service_blocks WHERE plan_id = ?').run(id);
        const insert = db.prepare(
          `INSERT INTO service_blocks (plan_id, type, position, song_id, scripture_ref, custom_data, notes, completed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (let i = 0; i < blocks.length; i++) {
          const b = blocks[i] || {};
          insert.run(
            id,
            typeof b.type === 'string' ? b.type : 'custom',
            Number.isFinite(b.position) ? b.position : i,
            Number.isFinite(b.song_id) ? b.song_id : null,
            typeof b.scripture_ref === 'string' ? b.scripture_ref : null,
            typeof b.custom_data === 'string' ? b.custom_data : null,
            typeof b.notes === 'string' ? b.notes : null,
            b.completed ? 1 : 0
          );
        }
      });
      trx();
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/blank', (req, res) => {
    const message = { type: 'DISPLAY_BLANK', payload: {} };
    applyMessageToState(message);
    broadcast(message);
    res.json({ status: 'blanked' });
  });

  app.post('/api/prev', (req, res) => {
    broadcast({ type: 'REMOTE_NAV', payload: { delta: -1 } });
    res.json({ ok: true });
  });

  app.post('/api/next', (req, res) => {
    broadcast({ type: 'REMOTE_NAV', payload: { delta: 1 } });
    res.json({ ok: true });
  });

  app.post('/api/go-live', (req, res) => {
    const { live } = req.body;
    const isLive = !!live;
    setSetting('go_live', isLive ? 'true' : 'false');
    applyMessageToState({ type: 'GO_LIVE', payload: { live: isLive } });
    broadcast({ type: 'GO_LIVE', payload: { live: isLive } });
    if (!isLive) {
      broadcast({ type: 'DISPLAY_CLEAR', payload: {} });
    } else {
      broadcast(serverState.currentMessage);
    }
    res.json({ live });
  });

  app.post('/api/clear', (req, res) => {
    const message = { type: 'DISPLAY_CLEAR', payload: {} };
    applyMessageToState(message);
    if (serverState.goLive) broadcast(message);
    res.json({ status: 'cleared' });
  });

  app.post('/api/broadcast', (req, res) => {
    try {
      const { type, payload } = req.body || {};
      if (!type || typeof type !== 'string') return res.status(400).json({ error: 'Missing type' });
      const message = { type, payload: payload ?? {} };

      // #region debug-point R2:broadcast-received
      if (type === 'OUTPUT_FREEZE' || type === 'GO_LIVE') {
        debugReport({
          hypothesisId: type === 'OUTPUT_FREEZE' ? 'H2' : 'H3',
          location: 'electron/server.js:/api/broadcast',
          msg: 'broadcast received',
          data: { type, payload: message.payload, ip: req.ip, ua: req.headers?.['user-agent'] || '' }
        });
      }
      // #endregion

      applyMessageToState(message);

      if (type === 'OUTPUT_FREEZE') {
        // #region debug-point R3:freeze-state-after-apply
        debugReport({
          hypothesisId: 'H2',
          location: 'electron/server.js:/api/broadcast:OUTPUT_FREEZE',
          msg: 'freeze applied',
          data: { freeze: serverState.freeze, payload: message.payload }
        });
        // #endregion
        broadcast({ type: 'OUTPUT_FREEZE', payload: serverState.freeze });
        const isUnfreeze =
          (typeof message.payload?.target === 'string' && message.payload.frozen === false) ||
          (message.payload && typeof message.payload === 'object' && Object.values(message.payload).some((v) => v === false));
        if (isUnfreeze && serverState.goLive) {
          broadcast(serverState.currentMessage);
        }
        // #region debug-point R4:freeze-broadcasted
        debugReport({
          hypothesisId: 'H2',
          location: 'electron/server.js:/api/broadcast:OUTPUT_FREEZE',
          msg: 'freeze broadcasted',
          data: { isUnfreeze, goLive: serverState.goLive, currentType: serverState.currentMessage?.type || '' }
        });
        // #endregion
        return res.json({ ok: true });
      }

      if (type === 'DISPLAY_BLANK' || type === 'DISPLAY_CLEAR' || type === 'GO_LIVE') {
        broadcast(message);
        return res.json({ ok: true });
      }

      if (shouldGate(type) && !serverState.goLive) {
        return res.json({ ok: true, gated: true });
      }

      broadcast(message);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/network', (req, res) => {
    const ip = getLocalIPv4();
    // #region debug-point R5:api-network
    debugReport({
      hypothesisId: 'H1',
      location: 'electron/server.js:/api/network',
      msg: 'api network called',
      data: { ip, port: serverPort, reqIp: req.ip, ua: req.headers?.['user-agent'] || '' }
    });
    // #endregion
    res.json({ ip, port: serverPort });
  });

  app.post('/api/lyrics/fetch', async (req, res) => {
    try {
      const body = req.body || {};
      const title = String(body.title || '').trim();
      const artist = String(body.artist || '').trim();
      if (!title) return res.status(400).json({ error: 'Missing title' });
      if (!artist) return res.status(400).json({ error: 'Missing artist' });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) return res.json({ ok: false, lyrics: '' });
        const data = await r.json().catch(() => ({}));
        const lyrics = typeof data.lyrics === 'string' ? data.lyrics : '';
        return res.json({ ok: !!lyrics, lyrics });
      } finally {
        try {
          clearTimeout(timeout);
        } catch {}
      }
    } catch (error) {
      return res.json({ ok: false, lyrics: '', error: error.message });
    }
  });

  app.get('/api/bible/translations', (req, res) => {
    try {
      const rows = db.prepare('SELECT DISTINCT translation FROM bible_verses ORDER BY translation').all();
      res.json({ translations: rows.map((r) => r.translation) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/bible/import', async (req, res) => {
    try {
      const list = Array.isArray(req.body?.items) ? req.body.items : [];
      if (list.length === 0) return res.status(400).json({ error: 'No items provided' });
      const items = list
        .map((it) => ({
          fileName: typeof it?.fileName === 'string' ? it.fileName : '',
          xml: typeof it?.xml === 'string' ? it.xml : '',
          translation: typeof it?.translation === 'string' ? it.translation : null
        }))
        .filter((it) => it.fileName && it.xml);
      if (items.length === 0) return res.status(400).json({ error: 'No valid items provided' });

      // #region debug-point BB1:bible-import-http
      bibleDebugReport({
        hypothesisId: 'H5',
        location: 'electron/server.js:/api/bible/import',
        msg: 'bible import request received',
        data: {
          count: items.length,
          sample: items.slice(0, 3).map((i) => ({ fileName: i.fileName, translation: i.translation ?? null, chars: i.xml.length })),
          ip: req.ip,
          ua: req.headers?.['user-agent'] || ''
        }
      });
      const t0 = Date.now();
      // #endregion

      const results = await importBibleXmlTextItems({ db, items });
      const ok = results.filter((r) => r?.ok).length;
      // #region debug-point BB2:bible-import-http-done
      bibleDebugReport({
        hypothesisId: 'H5',
        location: 'electron/server.js:/api/bible/import',
        msg: 'bible import request finished',
        data: { ok, total: results.length, ms: Date.now() - t0 }
      });
      // #endregion
      res.json({ ok: true, imported: ok, results });
    } catch (error) {
      // #region debug-point BB3:bible-import-http-error
      bibleDebugReport({
        hypothesisId: 'H5',
        location: 'electron/server.js:/api/bible/import',
        msg: 'bible import request error',
        data: { error: error?.message || 'server error' }
      });
      // #endregion
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/bible/search', (req, res) => {
    try {
      const q = typeof req.query?.q === 'string' ? req.query.q.trim() : '';
      if (!q) return res.json({ results: [] });
      const translation = typeof req.query?.translation === 'string' ? req.query.translation.trim() : '';
      const limit = Math.max(1, Math.min(100, Number(req.query?.limit) || 50));
      const terms = q
        .split(/\s+/)
        .map((t) => t.replace(/"/g, '').trim())
        .filter(Boolean)
        .map((t) => `${t}*`);
      const match = terms.join(' ');
      if (!match) return res.json({ results: [] });

      const rows = translation
        ? db
            .prepare(
              `SELECT book, chapter, verse, text, translation
               FROM bible_verses_fts
               WHERE bible_verses_fts MATCH ? AND translation = ?
               LIMIT ?`
            )
            .all(match, translation, limit)
        : db
            .prepare(
              `SELECT book, chapter, verse, text, translation
               FROM bible_verses_fts
               WHERE bible_verses_fts MATCH ?
               LIMIT ?`
            )
            .all(match, limit);

      res.json({
        results: rows.map((r) => ({
          reference: `${r.book} ${r.chapter}:${r.verse}`,
          text: r.text,
          translation: r.translation
        }))
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/bible/books', (req, res) => {
    try {
      const translation =
        (typeof req.query?.translation === 'string' && req.query.translation.trim()) ||
        getSetting('default_translation', 'KJV') ||
        'KJV';
      const rows = db
        .prepare('SELECT DISTINCT book FROM bible_verses WHERE translation = ?')
        .all(translation);
      const present = new Set(rows.map((r) => r.book).filter(Boolean));
      const ordered = BOOKS.filter((b) => present.has(b));
      const fallback = rows.map((r) => r.book).filter(Boolean).sort((a, b) => a.localeCompare(b));
      res.json({ translation, books: ordered.length ? ordered : fallback });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/bible/max', (req, res) => {
    try {
      const translation =
        (typeof req.query?.translation === 'string' && req.query.translation.trim()) ||
        getSetting('default_translation', 'KJV') ||
        'KJV';
      const book = typeof req.query?.book === 'string' ? req.query.book.trim() : '';
      if (!book) return res.status(400).json({ error: 'book is required' });

      const chapterParam = typeof req.query?.chapter === 'string' ? req.query.chapter.trim() : '';
      if (chapterParam) {
        const chapter = Number(chapterParam);
        if (!Number.isFinite(chapter)) return res.status(400).json({ error: 'chapter must be a number' });
        const row = db
          .prepare('SELECT MAX(verse) as maxVerse FROM bible_verses WHERE translation = ? AND book = ? AND chapter = ?')
          .get(translation, book, chapter);
        return res.json({ translation, book, chapter, maxVerse: row?.maxVerse ?? 0 });
      }

      const row = db
        .prepare('SELECT MAX(chapter) as maxChapter FROM bible_verses WHERE translation = ? AND book = ?')
        .get(translation, book);
      res.json({ translation, book, maxChapter: row?.maxChapter ?? 0 });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/state', (req, res) => {
    res.json({
      goLive: serverState.goLive,
      theme: serverState.theme,
      streamMode: serverState.streamMode,
      freeze: serverState.freeze,
      currentType: serverState.currentMessage.type
    });
  });

  app.get('/api/settings/public', (req, res) => {
    res.json({
      church_name: getSetting('church_name', 'My Church') || 'My Church',
      logo_url: (getSetting('logo_url', '') || '').trim(),
      image_fit_mode: ((getSetting('image_fit_mode', 'original') || 'original').trim().toLowerCase() === 'stretch') ? 'stretch' : 'original'
    });
  });

  app.get('/api/settings', (req, res) => {
    const keysRaw = typeof req.query?.keys === 'string' ? req.query.keys : '';
    const keys = keysRaw
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    const out = {};
    for (const k of keys) out[k] = getSetting(k, '');
    res.json(out);
  });

  app.post('/api/settings', (req, res) => {
    try {
      const body = req.body || {};
      const updates = body.updates && typeof body.updates === 'object' ? body.updates : null;
      if (updates) {
        for (const [k, v] of Object.entries(updates)) {
          if (typeof k !== 'string' || !k.trim()) continue;
          setSetting(k.trim(), v == null ? '' : String(v));
        }
      } else if (typeof body.key === 'string') {
        setSetting(body.key.trim(), body.value == null ? '' : String(body.value));
      }
      broadcast({
        type: 'SETTINGS_UPDATE',
        payload: {
          church_name: getSetting('church_name', 'My Church') || 'My Church',
          logo_url: (getSetting('logo_url', '') || '').trim(),
          remote_pin: getSetting('remote_pin', '0000') || '0000',
          remote_enabled: (getSetting('remote_enabled', 'true') || 'true') === 'true',
          image_fit_mode: ((getSetting('image_fit_mode', 'original') || 'original').trim().toLowerCase() === 'stretch') ? 'stretch' : 'original'
        }
      });
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/timer', (req, res) => {
    res.json(getTimerSnapshot());
  });

  app.post('/api/timer/start', (req, res) => {
    try {
      const body = req.body || {};
      const durationSecRaw =
        typeof body.durationSec === 'number'
          ? body.durationSec
          : typeof body.seconds === 'number'
            ? body.seconds
            : typeof body.minutes === 'number'
              ? body.minutes * 60
              : NaN;
      const durationSec = Number(durationSecRaw);
      if (!Number.isFinite(durationSec) || durationSec <= 0) return res.status(400).json({ error: 'durationSec must be > 0' });
      const durationMs = Math.round(durationSec * 1000);
      serverState.timer = {
        running: true,
        label: typeof body.label === 'string' ? body.label : '',
        durationMs,
        remainingMs: durationMs,
        startedAt: Date.now()
      };
      broadcastTimer();
      res.json(serverState.timer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/timer/pause', (req, res) => {
    try {
      const snap = getTimerSnapshot();
      serverState.timer = { ...snap, running: false, remainingMs: snap.remainingMs };
      broadcastTimer();
      res.json(serverState.timer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/timer/resume', (req, res) => {
    try {
      const snap = getTimerSnapshot();
      if (snap.running || snap.remainingMs <= 0) {
        res.json(snap);
        return;
      }
      const startedAt = Date.now() - (snap.durationMs - snap.remainingMs);
      serverState.timer = { ...snap, running: true, startedAt };
      broadcastTimer();
      res.json(serverState.timer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/timer/reset', (req, res) => {
    try {
      const snap = getTimerSnapshot();
      serverState.timer = { ...snap, running: false, remainingMs: snap.durationMs, startedAt: 0, label: snap.label || '' };
      broadcastTimer();
      res.json(serverState.timer);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/theme', (req, res) => {
    res.json(serverState.theme);
  });

  app.post('/api/theme', (req, res) => {
    try {
      const body = req.body || {};
      const message = {
        type: 'THEME_CHANGE',
        payload: {
          themeName: typeof body.themeName === 'string' ? body.themeName : undefined,
          primaryColor: typeof body.primaryColor === 'string' ? body.primaryColor : undefined,
          secondaryColor: typeof body.secondaryColor === 'string' ? body.secondaryColor : undefined,
          backgroundUrl: Object.prototype.hasOwnProperty.call(body, 'backgroundUrl') ? (body.backgroundUrl ? String(body.backgroundUrl) : null) : undefined,
          fontFamily: typeof body.fontFamily === 'string' ? body.fontFamily : undefined,
          overrides: Object.prototype.hasOwnProperty.call(body, 'overrides') ? body.overrides : undefined
        }
      };
      applyMessageToState(message);
      broadcast(message);
      res.json(serverState.theme);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/themes', (req, res) => {
    const raw = getSetting('custom_themes', '[]') || '[]';
    const list = safeParseJson(raw, []);
    res.json(Array.isArray(list) ? list : []);
  });

  app.post('/api/themes', (req, res) => {
    try {
      const body = req.body || {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return res.status(400).json({ error: 'name is required' });
      const theme = sanitizeThemeShape(body.theme && typeof body.theme === 'object' ? body.theme : body);
      if (Object.keys(theme).length === 0) return res.status(400).json({ error: 'theme is required' });

      const raw = getSetting('custom_themes', '[]') || '[]';
      const list = safeParseJson(raw, []);
      const arr = Array.isArray(list) ? list : [];
      const next = arr.filter((t) => t && typeof t.name === 'string' && t.name.trim() && t.name.trim() !== name);
      next.unshift({ name, theme: { ...theme, themeName: theme.themeName || name } });
      setSetting('custom_themes', JSON.stringify(next.slice(0, 200)));
      res.json({ ok: true, themes: next });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/themes/:name', (req, res) => {
    try {
      const name = typeof req.params?.name === 'string' ? decodeURIComponent(req.params.name).trim() : '';
      if (!name) return res.status(400).json({ error: 'name is required' });
      const raw = getSetting('custom_themes', '[]') || '[]';
      const list = safeParseJson(raw, []);
      const arr = Array.isArray(list) ? list : [];
      const next = arr.filter((t) => t && typeof t.name === 'string' && t.name.trim() && t.name.trim() !== name);
      setSetting('custom_themes', JSON.stringify(next));
      res.json({ ok: true, themes: next });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/media', (req, res) => {
    try {
      const rows = db.prepare('SELECT * FROM media_items ORDER BY created_at DESC, id DESC').all();
      res.json(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          fileName: r.file_name,
          url: `/media/${r.file_name}`,
          createdAt: r.created_at
        }))
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/media/:id', (req, res) => {
    try {
      const id = Number(req.params.id);
      const row = db.prepare('SELECT * FROM media_items WHERE id = ?').get(id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      db.prepare('DELETE FROM media_items WHERE id = ?').run(id);
      const mediaDir = process.env.PFP_MEDIA_DIR;
      if (mediaDir && row.file_name) {
        try {
          fs.unlinkSync(path.join(mediaDir, row.file_name));
        } catch {}
      }
      const url = `/media/${row.file_name}`;
      if (serverState.theme.backgroundUrl === url) {
        const message = { type: 'THEME_CHANGE', payload: { backgroundUrl: null } };
        applyMessageToState(message);
        broadcast(message);
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/remote/verify-pin', (req, res) => {
    const { pin } = req.body || {};
    const expected = getSetting('remote_pin', '0000') || '0000';
    const enabled = (getSetting('remote_enabled', 'true') || 'true') === 'true';
    if (!enabled) return res.status(403).json({ ok: false, error: 'Remote disabled' });
    // #region debug-point R6:remote-verify-pin
    debugReport({
      hypothesisId: 'H4',
      location: 'electron/server.js:/api/remote/verify-pin',
      msg: 'verify pin attempt',
      data: { ok: typeof pin === 'string' && pin === expected, reqIp: req.ip, host: req.headers?.host || '', ua: req.headers?.['user-agent'] || '' }
    });
    // #endregion
    res.json({ ok: typeof pin === 'string' && pin === expected });
  });

  app.get('/api/ai/status', (req, res) => {
    try {
      res.json(getAiStatus());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/ai/key', (req, res) => {
    try {
      const { key } = req.body || {};
      setOpenAIKey(key || '');
      res.json(getAiStatus());
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/ai/scripture-suggester', async (req, res) => {
    try {
      const { topic } = req.body || {};
      const results = await scriptureSuggester(String(topic || '').trim());
      res.json({ results });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/ai/sermon-to-slides', async (req, res) => {
    try {
      const { outline } = req.body || {};
      const slides = await sermonToSlides(String(outline || ''));
      res.json({ slides });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/ai/lyric-cleaner', async (req, res) => {
    try {
      const { lyrics } = req.body || {};
      const cleaned = await lyricCleaner(String(lyrics || ''));
      res.json({ lyrics: cleaned });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/ai/announcement-writer', async (req, res) => {
    try {
      const { details } = req.body || {};
      const result = await announcementWriter(String(details || ''));
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/ai/related-passages', async (req, res) => {
    try {
      const { reference } = req.body || {};
      const references = await relatedPassages(String(reference || '').trim());
      res.json({ references });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Start listening
  return new Promise((resolve, reject) => {
    httpServer.listen(serverPort, () => {
      log(`Express server listening on port ${serverPort}`);
      resolve(serverPort);
    }).on('error', reject);
  });
}

export async function stopServer() {
  return new Promise((resolve) => {
    if (timerInterval) {
      try {
        clearInterval(timerInterval);
      } catch {}
      timerInterval = null;
    }
    if (playlistInterval) {
      try {
        clearInterval(playlistInterval);
      } catch {}
      playlistInterval = null;
    }
    if (httpServer) {
      try {
        if (wss) {
          wss.clients.forEach((client) => {
            try {
              client.terminate();
            } catch {}
          });
          wss.close();
        }
      } catch {}

      httpServer.close(() => {
        log('HTTP server closed');
        httpServer = null;
        wss = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
