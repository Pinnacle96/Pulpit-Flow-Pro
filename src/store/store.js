import { create } from 'zustand';

const API_BASE = (typeof window !== 'undefined' && window.electron?.apiBase)
  ? window.electron.apiBase
  : 'http://localhost:3000';

export const useStore = create((set, get) => ({
  goLive: false,
  setGoLive: (live) => set({ goLive: live }),

  outputFreeze: {
    display: false,
    stream: false,
    stage: false,
    preacher: false
  },
  setOutputFreeze: async (target, frozen) => {
    const key = String(target || '').trim();
    if (!['display', 'stream', 'stage', 'preacher'].includes(key)) return;
    set((state) => ({ outputFreeze: { ...state.outputFreeze, [key]: !!frozen } }));
    try {
      await get().broadcast({ type: 'OUTPUT_FREEZE', payload: { target: key, frozen: !!frozen } });
    } catch {}
  },

  streamMode: 'lower',
  setStreamMode: async (mode) => {
    const next = String(mode || '').trim().toLowerCase() === 'full' ? 'full' : 'lower';
    set({ streamMode: next });
    try {
      await get().broadcast({ type: 'STREAM_MODE', payload: { mode: next } });
    } catch {}
  },

  centerTab: 'bible',
  setCenterTab: (tab) => set({ centerTab: tab }),

  currentBlock: null,
  setCurrentBlock: (block) => set({ currentBlock: block }),

  activeBlockIndex: -1,
  setActiveBlockIndex: (idx) => set({ activeBlockIndex: Number.isFinite(idx) ? idx : -1 }),

  stageChordMode: false,
  setStageChordMode: async (enabled) => {
    set({ stageChordMode: !!enabled });
    try {
      await get().broadcast({ type: 'STAGE_CHORD_MODE', payload: { enabled: !!enabled } });
    } catch {}
  },

  currentVerse: null,
  setCurrentVerse: (verse) => set({ currentVerse: verse }),

  currentSong: null,
  setCurrentSong: (song) => set({ currentSong: song }),

  servicePlan: [],
  setServicePlan: (plan) => set({ servicePlan: plan }),
  updateServiceBlock: (id, patch) =>
    set((state) => {
      const nextPlan = state.servicePlan.map((b) => (b?.id === id ? { ...b, ...patch } : b));
      const nextCurrent = state.currentBlock?.id === id ? { ...state.currentBlock, ...patch } : state.currentBlock;
      return { servicePlan: nextPlan, currentBlock: nextCurrent };
    }),

  theme: 'worship',
  activeThemeName: 'Worship',
  setTheme: (theme) => set({ theme }),
  setActiveThemeName: (name) => set({ activeThemeName: name || 'Worship' }),

  displayContent: {
    text: '',
    reference: '',
    translation: 'KJV'
  },
  setDisplayContent: (content) => set({ displayContent: content }),

  broadcast: async (message) => {
    try {
      const response = await fetch(`${API_BASE}/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      return await response.json();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Broadcast error:', error);
    }
  },

  getBlockTitle: (block) => {
    if (!block) return '';
    if (block.type === 'scripture') return block.scriptureRef || block.scripture_ref || 'Scripture';
    if (block.type === 'song') return block.title || 'Song';
    if (block.type === 'announcement') return block.title || 'Announcement';
    if (block.type === 'countdown') return block.title || 'Countdown';
    if (block.type === 'giving') return block.title || 'Giving';
    if (block.type === 'social') return block.title || 'Social';
    if (block.type === 'video') return block.title || 'Video';
    if (block.type === 'media') return block.title || 'Media';
    if (block.type === 'blank') return 'Blank';
    return block.title || 'Slide';
  },

  toQrDataUrl: async (text) => {
    const value = String(text || '').trim();
    if (!value) return '';
    try {
      const mod = await import('qrcode');
      const QRCode = mod?.default || mod;
      if (!QRCode?.toDataURL) return '';
      return await QRCode.toDataURL(value, { margin: 1, width: 512 });
    } catch {
      return '';
    }
  },

  sendBlockLive: async (block) => {
    const b = block || get().currentBlock;
    if (!b) return;
    const broadcast = get().broadcast;

    if (b.type === 'blank') {
      await fetch(`${API_BASE}/api/blank`, { method: 'POST' }).catch(() => {});
      return;
    }

    if (b.type === 'scripture') {
      const reference = String(b.scriptureRef || b.scripture_ref || '').trim();
      if (!reference) return;
      const translation = String(b.translation || 'KJV').trim() || 'KJV';
      const second = b.secondEnabled ? String(b.secondTranslation || '').trim() : '';
      await fetch(`${API_BASE}/api/verse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, translation, secondTranslation: second || null })
      }).catch(() => {});
      return;
    }

    if (b.type === 'announcement') {
      const t = String(b.title || '').trim();
      const body = String(b.body || '').trim();
      await broadcast({
        type: 'DISPLAY_SLIDE',
        payload: { title: t, body, background: b.backgroundUrl || null, duration: b.durationSec || null, type: 'announcement' }
      });
      return;
    }

    if (b.type === 'countdown') {
      const t = String(b.title || '').trim() || 'Service begins in';
      const sec = Number.isFinite(b.countdownSec) ? b.countdownSec : Number(b.durationSec) || 0;
      const durationSec = Math.max(1, Math.floor(sec));
      await broadcast({
        type: 'DISPLAY_SLIDE',
        payload: {
          title: t,
          body: '',
          background: b.backgroundUrl || null,
          type: 'countdown',
          durationSec,
          startedAt: Date.now()
        }
      });
      return;
    }

    if (b.type === 'giving') {
      const t = String(b.title || '').trim() || 'Give Online';
      const url = String(b.givingUrl || b.body || '').trim();
      if (!url) return;
      const qrDataUrl = await get().toQrDataUrl(url);
      await broadcast({
        type: 'DISPLAY_SLIDE',
        payload: {
          title: t,
          body: String(b.body || '').trim(),
          background: b.backgroundUrl || null,
          type: 'giving',
          givingUrl: url,
          qrDataUrl
        }
      });
      return;
    }

    if (b.type === 'social') {
      const platform = String(b.socialPlatform || 'Instagram').trim() || 'Instagram';
      const handle = String(b.socialHandle || b.body || '').trim();
      const t = String(b.title || '').trim() || 'Follow Us';
      await broadcast({
        type: 'DISPLAY_SLIDE',
        payload: {
          title: t,
          body: handle,
          background: b.backgroundUrl || null,
          type: 'social',
          platform,
          handle
        }
      });
      return;
    }

    if (b.type === 'video') {
      await broadcast({
        type: 'DISPLAY_SLIDE',
        payload: { title: '', body: '', background: b.backgroundUrl || null, type: 'video', state: 'play' }
      });
      return;
    }

    if (b.type === 'media') {
      const bg = String(b.backgroundUrl || '').trim();
      if (!bg) return;
      const isVideo = bg.toLowerCase().endsWith('.mp4') || bg.toLowerCase().endsWith('.webm') || bg.toLowerCase().endsWith('.mov') || bg.toLowerCase().endsWith('.ogg');
      await broadcast({
        type: 'DISPLAY_SLIDE',
        payload: isVideo
          ? { title: '', body: '', background: bg, type: 'video', state: 'play' }
          : { title: '', body: '', background: bg, type: 'media' }
      });
      return;
    }

    if (b.type === 'song') {
      const songId = Number(b.songId);
      if (!Number.isFinite(songId) || songId <= 0) return;
      const res = await fetch(`${API_BASE}/api/songs/${songId}`).catch(() => null);
      if (!res || !res.ok) return;
      const data = await res.json().catch(() => ({}));
      const sections = Array.isArray(data.sections) ? data.sections.sort((a, c) => (a.position ?? 0) - (c.position ?? 0)) : [];
      const rawIdx = Number.isFinite(b.sectionIndex) ? b.sectionIndex : 0;
      const idx = Math.max(0, Math.min(sections.length - 1, rawIdx));
      const sec = sections[idx];
      if (!sec) return;
      const next = sections[idx + 1] || null;
      const lines = String(sec.lyrics || '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
      const nextLines = next ? String(next.lyrics || '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0) : [];
      const chordsLines = String(sec.chords || '').split(/\r?\n/).map((l) => l.trimEnd());
      await broadcast({
        type: 'DISPLAY_LYRICS',
        payload: {
          songTitle: data.title || '',
          artist: data.artist || '',
          sectionLabel: sec.label || '',
          lines,
          nextSectionLabel: next?.label || '',
          nextLines,
          chordsLines
        }
      });
      return;
    }

    const t = String(b.title || '').trim();
    const body = String(b.body || '').trim();
    await broadcast({
      type: 'DISPLAY_SLIDE',
      payload: { title: t, body, background: b.backgroundUrl || null, duration: b.durationSec || null, type: 'custom' }
    });
  },

  activateBlockByIndex: async (idx) => {
    const state = get();
    const plan = Array.isArray(state.servicePlan) ? state.servicePlan : [];
    const nextIdx = Math.max(0, Math.min(plan.length - 1, idx));
    const block = plan[nextIdx] || null;
    set({ currentBlock: block, activeBlockIndex: block ? nextIdx : -1, centerTab: block ? 'block' : state.centerTab });
    if (block) {
      await state.broadcast({
        type: 'SERVICE_ADVANCE',
        payload: { blockIndex: nextIdx, blockType: block.type, blockTitle: state.getBlockTitle(block) }
      });
      await state.broadcast({ type: 'PREACHER_NOTE', payload: { note: String(block.notes || '') } });
      await state.sendBlockLive(block);
    }
  },

  runSongSectionRelative: async (delta) => {
    const state = get();
    const current = state.currentBlock;
    if (!current || current.type !== 'song') return;
    const idx = Number.isFinite(current.sectionIndex) ? current.sectionIndex : 0;
    const songId = Number(current.songId);
    if (Number.isFinite(songId) && songId > 0) {
      const res = await fetch(`${API_BASE}/api/songs/${songId}`).catch(() => null);
      const data = res && res.ok ? await res.json().catch(() => ({})) : null;
      const sections = data && Array.isArray(data.sections) ? data.sections : [];
      const maxIdx = Math.max(0, sections.length - 1);
      const nextIdx = idx + delta;
      if (nextIdx >= 0 && nextIdx <= maxIdx) {
        const updated = { ...current, sectionIndex: nextIdx };
        set((s) => ({
          servicePlan: s.servicePlan.map((b) => (b?.id === current.id ? updated : b)),
          currentBlock: updated
        }));
        await state.sendBlockLive(updated);
      }
      return;
    }
    const nextIdx = idx + delta;
    if (nextIdx < 0) return;
    const updated = { ...current, sectionIndex: nextIdx };
    set((s) => ({
      servicePlan: s.servicePlan.map((b) => (b?.id === current.id ? updated : b)),
      currentBlock: updated
    }));
    await state.sendBlockLive(updated);
  },

  activateNearestBlockOfType: async (type, delta) => {
    const state = get();
    const plan = Array.isArray(state.servicePlan) ? state.servicePlan : [];
    if (plan.length === 0) return;
    const curIdx = Number.isFinite(state.activeBlockIndex) && state.activeBlockIndex >= 0
      ? state.activeBlockIndex
      : plan.findIndex((b) => b?.id === state.currentBlock?.id);
    if (curIdx < 0) return;
    const step = delta >= 0 ? 1 : -1;
    for (let i = curIdx + step; i >= 0 && i < plan.length; i += step) {
      if (plan[i]?.type === type) {
        await state.activateBlockByIndex(i);
        return;
      }
    }
  },

  runRelative: async (delta) => {
    const state = get();
    if (state.centerTab === 'bible') {
      window.dispatchEvent(new CustomEvent(delta > 0 ? 'pfp-bible-next' : 'pfp-bible-prev'));
      return;
    }

    const current = state.currentBlock;
    if (!current) return;

    if (current.type === 'song') {
      await state.runSongSectionRelative(delta);
      const after = get().currentBlock;
      if (after && after.type === 'song' && after.sectionIndex !== current.sectionIndex) return;
    }

    const plan = Array.isArray(state.servicePlan) ? state.servicePlan : [];
    const curIdx = plan.findIndex((b) => b?.id === current.id);
    if (curIdx < 0) return;
    const target = curIdx + delta;
    if (target < 0 || target >= plan.length) return;
    await state.activateBlockByIndex(target);
  }
}));
