/** Normalize API / DB service blocks into dashboard-friendly shape. */

function parseCustom(raw) {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw.trim() || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function normalizeServiceBlock(raw) {
  if (!raw) return null;
  const custom = parseCustom(raw.custom_data ?? raw.customData);
  const songId = raw.songId ?? raw.song_id ?? custom.songId ?? null;
  const announcementId = raw.announcementId ?? raw.announcement_id ?? custom.announcementId ?? null;
  const mediaId = raw.mediaId ?? raw.media_id ?? custom.mediaId ?? null;

  return {
    id: raw.id,
    type: raw.type || 'custom',
    position: Number.isFinite(raw.position) ? raw.position : 0,
    completed: !!(raw.completed),
    notes: raw.notes || custom.notes || '',
    scriptureRef: raw.scriptureRef || raw.scripture_ref || custom.scriptureRef || '',
    translation: raw.translation || custom.translation || 'KJV',
    secondEnabled: !!(raw.secondEnabled ?? custom.secondEnabled),
    secondTranslation: raw.secondTranslation || custom.secondTranslation || 'NKJV',
    songId: Number.isFinite(Number(songId)) ? Number(songId) : null,
    sectionIndex: Number.isFinite(raw.sectionIndex) ? raw.sectionIndex : Number(custom.sectionIndex) || 0,
    announcementId: Number.isFinite(Number(announcementId)) ? Number(announcementId) : null,
    mediaId: Number.isFinite(Number(mediaId)) ? Number(mediaId) : null,
    title: raw.title || custom.title || '',
    body: raw.body || custom.body || '',
    backgroundUrl: raw.backgroundUrl || raw.background_url || custom.backgroundUrl || '',
    durationSec: raw.durationSec ?? raw.duration_sec ?? custom.durationSec ?? 0,
    countdownSec: raw.countdownSec ?? custom.countdownSec ?? 0,
    givingUrl: raw.givingUrl || custom.givingUrl || '',
    socialPlatform: raw.socialPlatform || custom.socialPlatform || 'Instagram',
    socialHandle: raw.socialHandle || custom.socialHandle || ''
  };
}

export function normalizeServiceBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks.map(normalizeServiceBlock).filter(Boolean).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export function blockToApi(block, position) {
  const b = block || {};
  const custom = {
    translation: b.translation,
    secondEnabled: b.secondEnabled,
    secondTranslation: b.secondTranslation,
    sectionIndex: b.sectionIndex,
    announcementId: b.announcementId,
    mediaId: b.mediaId,
    title: b.title,
    body: b.body,
    backgroundUrl: b.backgroundUrl,
    durationSec: b.durationSec,
    countdownSec: b.countdownSec,
    givingUrl: b.givingUrl,
    socialPlatform: b.socialPlatform,
    socialHandle: b.socialHandle
  };
  return {
    type: b.type || 'custom',
    position: Number.isFinite(position) ? position : 0,
    song_id: Number.isFinite(b.songId) ? b.songId : null,
    scripture_ref: b.scriptureRef || null,
    custom_data: JSON.stringify(custom),
    notes: b.notes || '',
    completed: b.completed ? 1 : 0
  };
}

export function blocksToApi(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map((b, i) => blockToApi(b, i));
}

export function getBlockDisplayTitle(block, { songs = [], announcements = [] } = {}) {
  if (!block) return 'Untitled';
  if (block.type === 'scripture') return block.scriptureRef || 'Scripture';
  if (block.type === 'song') {
    const song = songs.find((s) => s.id === block.songId);
    return song?.title || block.title || 'Song';
  }
  if (block.type === 'announcement') {
    const a = announcements.find((x) => x.id === block.announcementId);
    return a?.title || block.title || 'Announcement';
  }
  if (block.type === 'blank') return 'Blank';
  if (block.type === 'video') return block.title || 'Video';
  if (block.type === 'media') return block.title || 'Media';
  return block.title || block.type || 'Block';
}
