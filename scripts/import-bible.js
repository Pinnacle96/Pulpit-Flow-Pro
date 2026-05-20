import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import sax from 'sax';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Starting Bible data import...');

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

function parseArgs(argv) {
  const out = { xmlFiles: [], translation: null, dbPath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--xml' || a === '--xmlFile') {
      const v = argv[i + 1];
      if (v) out.xmlFiles.push(v);
      i += 1;
      continue;
    }
    if (a === '--translation') {
      out.translation = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (a === '--db') {
      out.dbPath = argv[i + 1] || null;
      i += 1;
      continue;
    }
  }
  return out;
}

function resolveDbPath(explicitDbPath) {
  if (explicitDbPath) return path.resolve(explicitDbPath);
  if (process.env.PFP_DB_PATH) return path.resolve(process.env.PFP_DB_PATH);
  const appDataDir = path.join(
    process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config')),
    'pulpit-flow-pro'
  );
  if (!fs.existsSync(appDataDir)) {
    fs.mkdirSync(appDataDir, { recursive: true });
  }
  return path.join(appDataDir, 'pulpit-flow-pro.db');
}

async function importBibleXmlIntoDb({ db, xmlPath, translation }) {
  const resolvedXmlPath = path.resolve(xmlPath);
  if (!fs.existsSync(resolvedXmlPath)) throw new Error(`XML file not found: ${resolvedXmlPath}`);
  if (!translation || typeof translation !== 'string') throw new Error('Missing --translation (e.g., NKJV)');

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO bible_verses (translation, book, chapter, verse, text)
     VALUES (?, ?, ?, ?, ?)`
  );

  let currentBook = null;
  let currentChapter = null;
  let currentVerse = null;
  let inVerse = false;
  let verseBuffer = '';
  let inserted = 0;

  db.run('BEGIN');

  await new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: false, normalize: false });

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

      insertStmt.run([translation, book, chapter, verse, text]);
      inserted += 1;
    });

    parser.on('error', (err) => {
      reject(err);
    });

    parser.on('end', () => {
      resolve();
    });

    const stream = fs.createReadStream(resolvedXmlPath, { encoding: 'utf8' });
    stream.on('error', reject);
    stream.pipe(parser);
  });

  db.run('COMMIT');
  insertStmt.free();

  return { inserted, xmlPath: resolvedXmlPath, translation };
}

const args = parseArgs(process.argv.slice(2));
const dbPath = resolveDbPath(args.dbPath);
console.log(`Database path: ${dbPath}`);

const SQL = await initSqlJs();

let db;
if (fs.existsSync(dbPath)) {
  const buffer = fs.readFileSync(dbPath);
  db = new SQL.Database(buffer);
  console.log('Loaded existing database');
} else {
  db = new SQL.Database();
  console.log('Created new database');
}

// Create schema
db.run(`
  CREATE TABLE IF NOT EXISTS bible_verses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    translation TEXT NOT NULL,
    book TEXT NOT NULL,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    text TEXT NOT NULL,
    UNIQUE(translation, book, chapter, verse)
  );
  CREATE INDEX IF NOT EXISTS idx_bible_ref ON bible_verses(translation, book, chapter, verse);
`);

// Sample KJV verses for Phase 1
const kjvVerses = [
  { book: 'Genesis', chapter: 1, verse: 1, text: 'In the beginning God created the heaven and the earth.' },
  { book: 'John', chapter: 3, verse: 16, text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
  { book: 'John', chapter: 3, verse: 17, text: 'For God sent not his Son into the world to condemn the world; but that the world through him might be saved.' },
  { book: 'John', chapter: 3, verse: 18, text: 'He that believeth on him is not condemned: but he that believeth not is condemned already, because he hath not believed in the name of the only begotten Son of God.' },
  { book: 'Romans', chapter: 8, verse: 28, text: 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.' },
  { book: 'Romans', chapter: 8, verse: 29, text: 'For whom he did foreknow, he also did predestinate to be conformed to the image of his Son, that he might be the firstborn among many brethren.' },
  { book: 'Romans', chapter: 8, verse: 30, text: 'Moreover whom he did predestinate, them he also called: and whom he called, them he also justified: and whom he justified, them he also glorified.' },
  { book: 'Matthew', chapter: 1, verse: 1, text: 'The book of the generation of Jesus Christ, the son of David, the son of Abraham.' },
  { book: 'Mark', chapter: 1, verse: 1, text: 'The beginning of the gospel of Jesus Christ, the Son of God;' },
  { book: 'Luke', chapter: 1, verse: 1, text: 'Forasmuch as many have taken in hand to set forth in order a declaration of those things which are most surely believed among us,' },
  { book: 'Psalms', chapter: 23, verse: 1, text: 'The LORD is my shepherd; I shall not want.' },
  { book: 'Psalms', chapter: 23, verse: 4, text: 'Yea, though I walk through the valley of the shadow of death, I will fear no evil: for thou art with me; thy rod and thy staff they comfort me.' },
  { book: 'Proverbs', chapter: 3, verse: 5, text: 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.' },
  { book: 'Isaiah', chapter: 53, verse: 5, text: 'But he was wounded for our transgressions, he was bruised for our iniquities: the chastisement of our peace was upon him; and with his stripes we are healed.' },
  { book: 'Ephesians', chapter: 2, verse: 8, text: 'For by grace are ye saved through faith; and that not of yourselves: it is the gift of God:' },
  { book: 'Philippians', chapter: 4, verse: 13, text: 'I can do all things through Christ which strengtheneth me.' },
  { book: 'James', chapter: 1, verse: 22, text: 'But be ye doers of the word, and not hearers only, deceiving your own selves.' },
  { book: 'Revelation', chapter: 3, verse: 20, text: 'Behold, I stand at the door, and knock: if any man hear my voice, and open the door, I will come in to him, and will sup with him, and he with me.' },
  { book: '1 Corinthians', chapter: 13, verse: 4, text: 'Charity suffereth long, and is kind; charity envieth not; charity vaunteth not itself, is not puffed up,' },
  { book: '1 Peter', chapter: 5, verse: 7, text: 'Casting all your care upon him; for he careth for you.' }
];

// Insert verses
try {
  if (args.xmlFiles.length > 0) {
    for (const xmlFile of args.xmlFiles) {
      const result = await importBibleXmlIntoDb({
        db,
        xmlPath: xmlFile,
        translation: args.translation
      });
      console.log(`✓ Imported ${result.inserted} verses from ${path.basename(result.xmlPath)} as ${result.translation}`);
    }
  } else {
    for (const v of kjvVerses) {
      db.run(
        `INSERT OR IGNORE INTO bible_verses (translation, book, chapter, verse, text)
         VALUES (?, ?, ?, ?, ?)`,
        ['KJV', v.book, v.chapter, v.verse, v.text]
      );
    }
  }

  const result = db.exec(`SELECT translation, COUNT(*) as count FROM bible_verses GROUP BY translation ORDER BY translation`);
  const counts =
    result.length && result[0].values
      ? result[0].values.map((v) => `${v[0]}=${v[1]}`).join(', ')
      : '';

  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  
  console.log(`✓ Bible verses in database: ${counts || 'n/a'}`);
  console.log('✓ Bible data imported successfully');
  console.log(`Database location: ${dbPath}`);
} catch (error) {
  console.error('Failed to import Bible data:', error);
  process.exit(1);
}

db.close();
