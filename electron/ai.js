import OpenAI from 'openai';
import { safeStorage } from 'electron';
import { getSetting, setSetting } from './database.js';

function getOpenAIKey() {
  const stored = getSetting('openai_api_key', '') || '';
  if (!stored) return null;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const decrypted = safeStorage.decryptString(Buffer.from(stored, 'base64'));
    return decrypted || null;
  } catch {
    return null;
  }
}

export function setOpenAIKey(plainTextKey) {
  if (typeof plainTextKey !== 'string') throw new Error('Invalid API key');
  const trimmed = plainTextKey.trim();
  if (!trimmed) {
    setSetting('openai_api_key', '');
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Encryption not available on this machine');
  }
  const encrypted = safeStorage.encryptString(trimmed);
  setSetting('openai_api_key', encrypted.toString('base64'));
}

function getClient() {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error('OpenAI API key not set');
  return new OpenAI({ apiKey });
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = text.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

async function runJsonPrompt(system, user, schemaHint) {
  const client = getClient();
  const response = await client.responses.create({
    model: 'gpt-4o',
    input: [
      { role: 'system', content: system },
      {
        role: 'user',
        content:
          user +
          '\n\nReturn ONLY valid JSON.\n' +
          (schemaHint ? `Schema: ${schemaHint}\n` : '')
      }
    ]
  });

  const text = response.output_text || '';
  const parsed = extractJson(text);
  if (!parsed) throw new Error('AI returned invalid JSON');
  return parsed;
}

export async function scriptureSuggester(topic) {
  const system =
    'You are a Bible reference assistant for a church production app. ' +
    'Suggest relevant scripture references for a sermon topic. Be concise.';
  const schema = `{ "results": [ { "reference": "John 3:16", "why": "..." } ] }`;
  const data = await runJsonPrompt(system, `Topic: ${topic}`, schema);
  const results = Array.isArray(data.results) ? data.results : [];
  return results
    .filter((r) => r && typeof r.reference === 'string')
    .slice(0, 5)
    .map((r) => ({
      reference: String(r.reference).trim(),
      why: typeof r.why === 'string' ? r.why.trim() : ''
    }));
}

export async function sermonToSlides(outline) {
  const system =
    'You convert sermon outlines into slide bullets for church projection. ' +
    'Keep slides short and readable.';
  const schema = `{ "slides": [ { "title": "Point 1", "body": "Bullet 1\\nBullet 2" } ] }`;
  const data = await runJsonPrompt(system, `Outline:\n${outline}`, schema);
  const slides = Array.isArray(data.slides) ? data.slides : [];
  return slides
    .filter((s) => s && typeof s.title === 'string')
    .slice(0, 12)
    .map((s) => ({
      title: String(s.title).trim(),
      body: typeof s.body === 'string' ? s.body.trim() : ''
    }));
}

export async function lyricCleaner(lyrics) {
  const system =
    'You clean song lyrics for projection: normalize capitalization, spacing, and line breaks. ' +
    'Do not add new words.';
  const schema = `{ "lyrics": "cleaned text" }`;
  const data = await runJsonPrompt(system, `Lyrics:\n${lyrics}`, schema);
  if (typeof data.lyrics !== 'string') throw new Error('Invalid AI response');
  return data.lyrics.trim();
}

export async function announcementWriter(details) {
  const system =
    'You write clean church announcement slide text. Output must be short, direct, and readable.';
  const schema = `{ "title": "Title", "body": "Line 1\\nLine 2" }`;
  const data = await runJsonPrompt(system, `Event details:\n${details}`, schema);
  return {
    title: typeof data.title === 'string' ? data.title.trim() : '',
    body: typeof data.body === 'string' ? data.body.trim() : ''
  };
}

export async function relatedPassages(reference) {
  const system =
    'You suggest thematically related Bible passage references. Return only references.';
  const schema = `{ "references": ["Romans 8:28", "Psalm 23:1"] }`;
  const data = await runJsonPrompt(system, `Open passage: ${reference}`, schema);
  const refs = Array.isArray(data.references) ? data.references : [];
  return refs
    .filter((r) => typeof r === 'string')
    .slice(0, 8)
    .map((r) => r.trim());
}

export function getAiStatus() {
  return {
    provider: 'openai',
    model: 'gpt-4o',
    encryptionAvailable: safeStorage.isEncryptionAvailable(),
    keySet: !!getOpenAIKey()
  };
}

