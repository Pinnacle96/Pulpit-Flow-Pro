import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

let db = null;
let dbPath = null;
const DEV = !app.isPackaged;
const log = (...args) => {
  if (DEV) console.log(...args);
};

export async function getDatabase() {
  if (!db) {
    dbPath = process.env.PFP_DB_PATH || path.join(app.getPath('userData'), 'pulpit-flow-pro.db');
    const dir = path.dirname(dbPath);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
    try {
      db = new Database(dbPath);
      try {
        db.pragma('journal_mode = MEMORY');
      } catch {}
      try {
        db.pragma('foreign_keys = ON');
      } catch {}
      log('✓ Database opened:', dbPath);
    } catch (error) {
      console.error('Database open error:', error);
      throw error;
    }

    initializeSchema();
    
    // Verify data was loaded
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM bible_verses').get();
      log(`✓ Database contains ${row?.count ?? 0} verses`);
    } catch (e) {
      log('Bible table not yet populated (this is normal on first run)');
    }
  }
  return db;
}

function initializeSchema() {
  db.exec(`
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

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS bible_verses_fts
      USING fts5(text, translation, book, chapter UNINDEXED, verse UNINDEXED);

      CREATE TRIGGER IF NOT EXISTS bible_verses_ai AFTER INSERT ON bible_verses BEGIN
        INSERT INTO bible_verses_fts(rowid, text, translation, book, chapter, verse)
        VALUES (new.id, new.text, new.translation, new.book, new.chapter, new.verse);
      END;

      CREATE TRIGGER IF NOT EXISTS bible_verses_ad AFTER DELETE ON bible_verses BEGIN
        DELETE FROM bible_verses_fts WHERE rowid = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS bible_verses_au AFTER UPDATE ON bible_verses BEGIN
        DELETE FROM bible_verses_fts WHERE rowid = old.id;
        INSERT INTO bible_verses_fts(rowid, text, translation, book, chapter, verse)
        VALUES (new.id, new.text, new.translation, new.book, new.chapter, new.verse);
      END;
    `);
  } catch {}

  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM bible_verses WHERE translation = ?').get('KJV');
    const count = row?.count ?? 0;
    if (count === 0) {
      const verses = [
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

      const insert = db.prepare(
        `INSERT OR IGNORE INTO bible_verses (translation, book, chapter, verse, text)
         VALUES (?, ?, ?, ?, ?)`
      );
      const trx = db.transaction((rows) => {
        for (const v of rows) insert.run('KJV', v.book, v.chapter, v.verse, v.text);
      });
      trx(verses);
    }
  } catch {}

  try {
    const bibleCount = db.prepare('SELECT COUNT(*) as c FROM bible_verses').get()?.c ?? 0;
    const ftsCount = db.prepare('SELECT COUNT(*) as c FROM bible_verses_fts').get()?.c ?? 0;
    if (bibleCount > 0 && ftsCount === 0) {
      db.prepare(
        `INSERT INTO bible_verses_fts(rowid, text, translation, book, chapter, verse)
         SELECT id, text, translation, book, chapter, verse FROM bible_verses`
      ).run();
    }
  } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      artist TEXT,
      ccli_number TEXT,
      key_sig TEXT,
      tempo TEXT,
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS song_sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      label TEXT NOT NULL,
      lyrics TEXT,
      chords TEXT,
      position INTEGER NOT NULL,
      locked INTEGER DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS service_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      service_date DATE,
      template INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS service_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES service_plans(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      position INTEGER NOT NULL,
      song_id INTEGER REFERENCES songs(id),
      scripture_ref TEXT,
      custom_data TEXT,
      notes TEXT,
      completed INTEGER DEFAULT 0
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    );
  `);
  try { db.prepare('ALTER TABLE announcements ADD COLUMN background_url TEXT').run(); } catch {}
  try { db.prepare('ALTER TABLE announcements ADD COLUMN duration_sec INTEGER').run(); } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const defaults = [
    ['church_name', 'My Church'],
    ['primary_color', '#1B2A4A'],
    ['secondary_color', '#C9A84C'],
    ['background_url', ''],
    ['logo_url', '/outputs/pfp-logo.svg'],
    ['font_family', 'Open Sans'],
    ['theme_overrides', '{}'],
    ['custom_themes', '[]'],
    ['default_translation', 'KJV'],
    ['server_port', '3000'],
    ['remote_pin', '0000'],
    ['go_live', 'false'],
    ['remote_enabled', 'true'],
    ['stream_mode', 'lower'],
    ['openai_api_key', '']
  ];
  const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaults) insertDefault.run(key, value);

  try {
    const existingLogo = db.prepare('SELECT value FROM settings WHERE key = ?').get('logo_url')?.value ?? '';
    if (!String(existingLogo || '').trim()) {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('logo_url', '/outputs/pfp-logo.svg');
    }
  } catch {}

  log('✓ Database schema initialized');
}

export function insertVerses(verses) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO bible_verses (translation, book, chapter, verse, text)
     VALUES (@translation, @book, @chapter, @verse, @text)`
  );
  const trx = db.transaction((rows) => {
    for (const row of rows) insert.run(row);
  });
  trx(verses);
}

export function getSetting(key, defaultValue = null) {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setSetting(key, value) {
  try {
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, value);
  } catch (error) {
    console.error('Set setting error:', error);
  }
}

export function closeDatabase() {
  try {
    if (db) db.close();
  } catch (error) {
    console.error('Database close error:', error);
  } finally {
    db = null;
  }
}
