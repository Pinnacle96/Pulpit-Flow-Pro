import fs from 'fs';
import path from 'path';
import sax from 'sax';
import { Readable } from 'stream';

// #region debug-point B0:debug-reporter
const DEBUG_SESSION_ID = 'bible-import-hang';
let DEBUG_SERVER_URL = '';
let DEBUG_RUN_ID = process.env.PFP_BIBLE_DEBUG_RUN_ID || process.env.PFP_DEBUG_RUN_ID || 'pre';
try {
  const envPath = path.join(process.cwd(), '.dbg', `${DEBUG_SESSION_ID}.env`);
  if (fs.existsSync(envPath)) {
    const raw = fs.readFileSync(envPath, 'utf8');
    const line = raw.split(/\r?\n/).find((l) => l.startsWith('DEBUG_SERVER_URL='));
    if (line) DEBUG_SERVER_URL = line.slice('DEBUG_SERVER_URL='.length).trim();
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

function normalizeTranslation(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toUpperCase();
  if (!v) return null;
  if (!/^[A-Z0-9]{2,8}$/.test(v)) return null;
  return v;
}

function deriveTranslationFromName(name) {
  const raw = typeof name === 'string' ? name : '';
  const base = raw.trim().replace(/\.[a-z0-9]+$/i, '');
  const cleaned = base.toUpperCase().replace(/[^A-Z0-9]+/g, '');
  const withoutBible = cleaned.replace(/BIBLE/g, '');
  const candidate = (withoutBible || cleaned).slice(0, 8);
  return normalizeTranslation(candidate);
}

export function guessTranslationFromFilename(filePath) {
  const base = path.basename(filePath).toUpperCase();
  const patterns = [
    ['AMPLIFIEDCLASSIC', 'AMPC'],
    ['AMPLIFIED', 'AMP'],
    ['NKJ', 'NKJV'],
    ['NKJV', 'NKJV'],
    ['KJ', 'KJV'],
    ['KJV', 'KJV'],
    ['NIV', 'NIV'],
    ['NLT', 'NLT'],
    ['ESV', 'ESV'],
    ['RSV', 'RSV'],
    ['GNT', 'GNT'],
    ['GW', 'GW'],
    ['MSG', 'MSG'],
    ['TLB', 'TLB'],
    ['TLBIBLE', 'TLB'],
    ['MEV', 'MEV'],
    ['ASV', 'ASV']
  ];
  for (const [needle, code] of patterns) {
    if (base.includes(needle)) return code;
  }
  return null;
}

async function importSingleXml({ db, filePath, translation }) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) throw new Error(`XML file not found: ${resolvedPath}`);

  // #region debug-point B1:import-file-start
  let sizeBytes = 0;
  try {
    sizeBytes = Number(fs.statSync(resolvedPath).size || 0);
  } catch {}
  debugReport({
    hypothesisId: 'H2',
    location: 'electron/bibleImport.js:importSingleXml',
    msg: 'start import file',
    data: {
      filePath: resolvedPath,
      translationProvided: translation ?? null,
      translationGuess: guessTranslationFromFilename(resolvedPath),
      sizeBytes
    }
  });
  const t0 = Date.now();
  // #endregion

  const tr = normalizeTranslation(translation) || guessTranslationFromFilename(resolvedPath) || deriveTranslationFromName(resolvedPath);
  if (!tr) throw new Error(`Invalid translation code for ${path.basename(resolvedPath)}`);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO bible_verses (translation, book, chapter, verse, text)
     VALUES (?, ?, ?, ?, ?)`
  );

  let currentBook = null;
  let currentChapter = null;
  let currentVerse = null;
  let inVerse = false;
  let verseBuffer = '';
  let inserted = 0;

  const BATCH_SIZE = 250;
  let batch = [];
  const flush = db.transaction((rows) => {
    for (const r of rows) {
      insert.run(tr, r.book, r.chapter, r.verse, r.text);
      inserted += 1;
    }
  });

  const parser = sax.createStream(true, { trim: false, normalize: false });
  const stream = fs.createReadStream(resolvedPath, { encoding: 'utf8' });

  let resolveDone;
  let rejectDone;
  const done = new Promise((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  let flushing = false;
  const flushBatch = async () => {
    if (flushing) return;
    if (!batch.length) return;
    flushing = true;
    const rows = batch;
    batch = [];
    try {
      flush(rows);
    } finally {
      await new Promise((r) => setImmediate(r));
      flushing = false;
    }
  };

  parser.on('opentag', (node) => {
    const name = String(node.name || '').toLowerCase();
    const attrs = node.attributes || {};

    if (name === 'book') {
      const n = attrs.number ?? attrs.NUMBER ?? attrs.Number;
      const num = n != null ? Number(n) : null;
      const bookName = attrs.name ?? attrs.NAME ?? attrs.Name;
      if (bookName && typeof bookName === 'string') {
        currentBook = bookName.trim();
      } else if (Number.isFinite(num)) {
        currentBook = BOOKS[num - 1] || null;
      } else {
        currentBook = null;
      }
      return;
    }

    if (name === 'chapter') {
      const n = attrs.number ?? attrs.NUMBER ?? attrs.Number;
      const num = n != null ? Number(n) : null;
      currentChapter = Number.isFinite(num) ? num : null;
      return;
    }

    if (name === 'verse') {
      const n = attrs.number ?? attrs.NUMBER ?? attrs.Number;
      const num = n != null ? Number(n) : null;
      currentVerse = Number.isFinite(num) ? num : null;
      inVerse = true;
      verseBuffer = '';
    }
  });

  parser.on('text', (t) => {
    if (!inVerse) return;
    verseBuffer += t;
  });

  parser.on('cdata', (t) => {
    if (!inVerse) return;
    verseBuffer += t;
  });

  parser.on('closetag', (tagName) => {
    const name = String(tagName || '').toLowerCase();
    if (name !== 'verse') return;
    inVerse = false;

    const book = currentBook;
    const chapter = currentChapter;
    const verse = currentVerse;
    const text = verseBuffer.replace(/\s+/g, ' ').trim();

    if (!book || !Number.isFinite(chapter) || !Number.isFinite(verse) || !text) return;
    batch.push({ book, chapter, verse, text });
    if (batch.length < BATCH_SIZE) return;
    stream.pause();
    Promise.resolve()
      .then(flushBatch)
      .then(() => stream.resume())
      .catch((e) => parser.emit('error', e));
  });

  parser.on('error', (e) => {
    try {
      stream.destroy();
    } catch {}
    rejectDone(e);
  });

  parser.on('end', () => {
    Promise.resolve()
      .then(flushBatch)
      .then(() => resolveDone())
      .catch((e) => rejectDone(e));
  });

  stream.on('error', (e) => parser.emit('error', e));
  stream.pipe(parser);

  await done;
  // #region debug-point B2:import-file-done
  debugReport({
    hypothesisId: 'H4',
    location: 'electron/bibleImport.js:importSingleXml',
    msg: 'finished import file',
    data: { filePath: resolvedPath, translation: tr, inserted, ms: Date.now() - t0 }
  });
  // #endregion
  return { ok: true, translation: tr, filePath: resolvedPath, inserted };
}

export async function importBibleXmlFiles({ db, files }) {
  if (!Array.isArray(files) || files.length === 0) throw new Error('No files provided');
  // #region debug-point B3:import-files-start
  debugReport({
    hypothesisId: 'H1',
    location: 'electron/bibleImport.js:importBibleXmlFiles',
    msg: 'start import files',
    data: {
      count: files.length,
      files: files.slice(0, 5).map((f) => ({ filePath: f?.filePath || null, translation: f?.translation ?? null }))
    }
  });
  const t0 = Date.now();
  // #endregion
  const results = [];
  for (const f of files) {
    const filePath = typeof f?.filePath === 'string' ? f.filePath : '';
    const translation = typeof f?.translation === 'string' ? f.translation : null;
    try {
      if (!filePath) throw new Error('Missing filePath');
      results.push(await importSingleXml({ db, filePath, translation }));
    } catch (e) {
      // #region debug-point B4:import-file-error
      debugReport({
        hypothesisId: 'H2',
        location: 'electron/bibleImport.js:importBibleXmlFiles',
        msg: 'import file error',
        data: { filePath: filePath || null, translation: translation ?? null, error: e?.message || 'Import failed' }
      });
      // #endregion
      results.push({
        ok: false,
        translation: normalizeTranslation(translation) || guessTranslationFromFilename(filePath) || deriveTranslationFromName(filePath),
        filePath: filePath || null,
        inserted: 0,
        error: e?.message || 'Import failed'
      });
    }
  }
  // #region debug-point B5:import-files-done
  debugReport({
    hypothesisId: 'H4',
    location: 'electron/bibleImport.js:importBibleXmlFiles',
    msg: 'finished import files',
    data: {
      ok: results.filter((r) => r?.ok).length,
      total: results.length,
      ms: Date.now() - t0
    }
  });
  // #endregion
  return results;
}

async function importSingleXmlText({ db, xml, translation, fileName }) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('Missing XML content');
  const tr =
    normalizeTranslation(translation) || guessTranslationFromFilename(fileName || '') || deriveTranslationFromName(fileName || '');
  if (!tr) throw new Error('Invalid translation code');

  // #region debug-point B6:import-text-start
  debugReport({
    hypothesisId: 'H5',
    location: 'electron/bibleImport.js:importSingleXmlText',
    msg: 'start import xml text',
    data: { fileName: fileName || null, translationProvided: translation ?? null, translationResolved: tr, chars: xml.length }
  });
  const t0 = Date.now();
  // #endregion

  const insert = db.prepare(
    `INSERT OR IGNORE INTO bible_verses (translation, book, chapter, verse, text)
     VALUES (?, ?, ?, ?, ?)`
  );

  let currentBook = null;
  let currentChapter = null;
  let currentVerse = null;
  let inVerse = false;
  let verseBuffer = '';
  let inserted = 0;

  const trx = db.transaction(() => {
    const parser = sax.createStream(true, { trim: false, normalize: false });

    const done = new Promise((resolve, reject) => {
      parser.on('opentag', (node) => {
        const name = String(node.name || '').toLowerCase();
        const attrs = node.attributes || {};

        if (name === 'book') {
          const n = attrs.number ?? attrs.NUMBER ?? attrs.Number;
          const num = n != null ? Number(n) : null;
          const bookName = attrs.name ?? attrs.NAME ?? attrs.Name;
          if (bookName && typeof bookName === 'string') {
            currentBook = bookName.trim();
          } else if (Number.isFinite(num)) {
            currentBook = BOOKS[num - 1] || null;
          } else {
            currentBook = null;
          }
          return;
        }

        if (name === 'chapter') {
          const n = attrs.number ?? attrs.NUMBER ?? attrs.Number;
          const num = n != null ? Number(n) : null;
          currentChapter = Number.isFinite(num) ? num : null;
          return;
        }

        if (name === 'verse') {
          const n = attrs.number ?? attrs.NUMBER ?? attrs.Number;
          const num = n != null ? Number(n) : null;
          currentVerse = Number.isFinite(num) ? num : null;
          inVerse = true;
          verseBuffer = '';
        }
      });

      parser.on('text', (t) => {
        if (!inVerse) return;
        verseBuffer += t;
      });

      parser.on('cdata', (t) => {
        if (!inVerse) return;
        verseBuffer += t;
      });

      parser.on('closetag', (tagName) => {
        const name = String(tagName || '').toLowerCase();
        if (name !== 'verse') return;
        inVerse = false;

        const book = currentBook;
        const chapter = currentChapter;
        const verse = currentVerse;
        const text = verseBuffer.replace(/\s+/g, ' ').trim();

        if (!book || !Number.isFinite(chapter) || !Number.isFinite(verse) || !text) return;
        insert.run(tr, book, chapter, verse, text);
        inserted += 1;
      });

      parser.on('error', reject);
      parser.on('end', resolve);
    });

    const stream = Readable.from([xml]);
    stream.on('error', (e) => parser.emit('error', e));
    stream.pipe(parser);

    return done;
  });

  await trx();
  // #region debug-point B7:import-text-done
  debugReport({
    hypothesisId: 'H5',
    location: 'electron/bibleImport.js:importSingleXmlText',
    msg: 'finished import xml text',
    data: { fileName: fileName || null, translation: tr, inserted, ms: Date.now() - t0 }
  });
  // #endregion
  return { ok: true, translation: tr, inserted };
}

export async function importBibleXmlTextItems({ db, items }) {
  if (!Array.isArray(items) || items.length === 0) throw new Error('No items provided');
  const results = [];
  for (const it of items) {
    const fileName = typeof it?.fileName === 'string' ? it.fileName : '';
    const xml = typeof it?.xml === 'string' ? it.xml : '';
    const translation = typeof it?.translation === 'string' ? it.translation : null;
    try {
      results.push(await importSingleXmlText({ db, xml, translation, fileName }));
    } catch (e) {
      results.push({
        ok: false,
        translation: normalizeTranslation(translation) || guessTranslationFromFilename(fileName),
        inserted: 0,
        error: e?.message || 'Import failed'
      });
    }
  }
  return results;
}

