import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/store.js';

const API_BASE = (typeof window !== 'undefined' && window.electron?.apiBase)
  ? window.electron.apiBase
  : 'http://localhost:3000';

function safeId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

export default function SongsPanel() {
  const { broadcast, setCenterTab } = useStore();
  const [query, setQuery] = useState('');
  const [songs, setSongs] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);
  const [importText, setImportText] = useState('');
  const [aiCleaning, setAiCleaning] = useState(false);
  const [fetchingLyrics, setFetchingLyrics] = useState(false);

  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [ccli, setCcli] = useState('');
  const [keySig, setKeySig] = useState('');
  const [tempo, setTempo] = useState('');
  const [tags, setTags] = useState('');
  const [sections, setSections] = useState([]);
  const [sectionIndex, setSectionIndex] = useState(0);

  const selected = useMemo(() => songs.find((s) => s.id === selectedId) || null, [songs, selectedId]);
  const orderLocked = useMemo(() => sections.some((s) => !!s.locked), [sections]);

  const loadSongs = async (q = query) => {
    setLoading(true);
    setStatus(null);
    try {
      const url = new URL(`${API_BASE}/api/songs`);
      if (q.trim()) url.searchParams.set('q', q.trim());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to load songs');
      const data = await res.json();
      setSongs(Array.isArray(data) ? data : []);
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Load failed' });
    } finally {
      setLoading(false);
    }
  };

  const loadSong = async (id) => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/songs/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load song');
      setSelectedId(data.id);
      setTitle(data.title || '');
      setArtist(data.artist || '');
      setCcli(data.ccli_number || '');
      setKeySig(data.key_sig || '');
      setTempo(data.tempo || '');
      setTags(data.tags || '');
      const secs = Array.isArray(data.sections) ? data.sections : [];
      setSections(
        secs.map((s, idx) => ({
          id: safeId(),
          type: s.type || 'custom',
          label: s.label || `Section ${idx + 1}`,
          lyrics: s.lyrics || '',
          chords: s.chords || '',
          locked: !!s.locked
        }))
      );
      setSectionIndex(0);
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Load failed' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSongs('');
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadSong(selectedId);
  }, [selectedId]);

  const createNew = () => {
    setSelectedId(null);
    setTitle('');
    setArtist('');
    setCcli('');
    setKeySig('');
    setTempo('');
    setTags('');
    setSections([{ id: safeId(), type: 'verse', label: 'Verse 1', lyrics: '', chords: '', locked: false }]);
    setSectionIndex(0);
    setStatus(null);
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        title: title.trim(),
        artist: artist.trim(),
        ccli_number: ccli.trim(),
        key_sig: keySig.trim(),
        tempo: tempo.trim(),
        tags: tags.trim()
      };
      if (!payload.title) throw new Error('Title is required');

      let id = selectedId;
      if (id == null) {
        const res = await fetch(`${API_BASE}/api/songs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Create failed');
        id = Number(data.id);
        setSelectedId(id);
      } else {
        const res = await fetch(`${API_BASE}/api/songs/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Update failed');
      }

      const secPayload = {
        sections: sections.map((s, idx) => ({
          type: s.type,
          label: s.label,
          lyrics: s.lyrics,
          chords: s.chords,
          position: idx,
          locked: s.locked
        }))
      };
      const secRes = await fetch(`${API_BASE}/api/songs/${id}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(secPayload)
      });
      const secData = await secRes.json();
      if (!secRes.ok) throw new Error(secData?.error || 'Section save failed');

      await loadSongs();
      setStatus({ ok: true, message: 'Saved' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (selectedId == null) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/songs/${selectedId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Delete failed');
      await loadSongs();
      createNew();
      setStatus({ ok: true, message: 'Deleted' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Delete failed' });
    } finally {
      setSaving(false);
    }
  };

  const addSection = () => {
    setSections((prev) => [...prev, { id: safeId(), type: 'custom', label: `Section ${prev.length + 1}`, lyrics: '', chords: '', locked: false }]);
  };

  const cleanLyricsWithAi = async () => {
    const raw = String(importText || '').trim();
    if (!raw) return;
    setAiCleaning(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/ai/lyric-cleaner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics: raw })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'AI request failed');
      if (data.lyrics) setImportText(data.lyrics);
      setStatus({ ok: true, message: 'Lyrics cleaned with AI' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'AI unavailable — set API key in Settings' });
    } finally {
      setAiCleaning(false);
    }
  };

  const importFromText = () => {
    const raw = String(importText || '').replace(/\r/g, '').trim();
    if (!raw) return;
    const lines = raw.split('\n');
    const next = [];
    let current = null;
    const pushCurrent = () => {
      if (!current) return;
      const lyrics = current.lyrics.join('\n').trim();
      if (!lyrics) return;
      next.push({
        id: safeId(),
        type: current.type,
        label: current.label,
        lyrics,
        chords: '',
        locked: false
      });
    };
    for (const line of lines) {
      const header = line.trim().match(/^\[(.+?)\]\s*$/);
      if (header) {
        pushCurrent();
        const label = header[1].trim();
        const lower = label.toLowerCase();
        const type =
          lower.includes('chorus')
            ? 'chorus'
            : lower.includes('bridge')
              ? 'bridge'
              : lower.includes('tag')
                ? 'tag'
                : lower.includes('verse')
                  ? 'verse'
                  : 'custom';
        current = { label: label || `Section ${next.length + 1}`, type, lyrics: [] };
        continue;
      }
      if (!current) current = { label: 'Lyrics', type: 'custom', lyrics: [] };
      current.lyrics.push(line.trimEnd());
    }
    pushCurrent();
    if (next.length) {
      setSections(next);
      setSectionIndex(0);
      setImportText('');
    }
  };

  const updateSection = (idx, patch) => {
    setSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeSection = (idx) => {
    const s = sections[idx];
    if (orderLocked || s?.locked) return;
    setSections((prev) => prev.filter((_, i) => i !== idx));
    setSectionIndex((v) => Math.max(0, Math.min(v, sections.length - 2)));
  };

  const moveSection = (from, delta) => {
    if (orderLocked) return;
    const s = sections[from];
    if (s?.locked) return;
    const to = from + delta;
    if (to < 0 || to >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setSectionIndex(to);
  };

  const autoFetchLyrics = async () => {
    const t = String(title || '').trim();
    const a = String(artist || '').trim();
    if (!t || !a) {
      setStatus({ ok: false, message: 'Enter Title and Artist first' });
      return;
    }
    setFetchingLyrics(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/lyrics/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, artist: a })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Lyrics fetch failed');
      const lyrics = typeof data.lyrics === 'string' ? data.lyrics.trim() : '';
      if (!lyrics) {
        setStatus({ ok: false, message: 'Lyrics not found' });
        return;
      }
      setImportText(lyrics);
      setStatus({ ok: true, message: 'Lyrics fetched' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Lyrics fetch failed' });
    } finally {
      setFetchingLyrics(false);
    }
  };

  const sendSection = async (idx) => {
    const s = sections[idx];
    if (!s) return;
    const next = sections[idx + 1] || null;
    const lines = String(s.lyrics || '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
    const nextLines = next ? String(next.lyrics || '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0) : [];
    const chordsLines = String(s.chords || '').split(/\r?\n/).map((l) => l.trimEnd());
    await broadcast({
      type: 'DISPLAY_LYRICS',
      payload: {
        songTitle: title.trim() || selected?.title || '',
        artist: artist.trim() || selected?.artist || '',
        sectionLabel: s.label || '',
        lines,
        nextSectionLabel: next?.label || '',
        nextLines,
        chordsLines
      }
    });
    setCenterTab('block');
  };

  return (
    <div className="center-panel-inner">
      <div className="center-split">
        <div className="center-list">
          <div className="center-toolbar">
            <input
              className="search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs..."
            />
            <button className="btn-search" onClick={() => loadSongs()}>
              {loading ? 'Loading...' : 'Search'}
            </button>
          </div>

          <button className="btn-secondary" onClick={createNew}>
            New Song
          </button>

          <div className="item-list">
            {songs.map((s) => (
              <div key={s.id} className={`item-row ${selectedId === s.id ? 'active' : ''}`} onClick={() => setSelectedId(s.id)}>
                <div className="item-title">{s.title}</div>
                <div className="item-sub">{s.artist || ''}</div>
              </div>
            ))}
            {!loading && songs.length === 0 && <div className="empty-state">No songs</div>}
          </div>
        </div>

        <div className="center-editor">
          <div className="editor-grid">
            <input className="search-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <input className="search-input" value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
            <div className="editor-row">
              <input className="search-input" value={ccli} onChange={(e) => setCcli(e.target.value)} placeholder="CCLI" />
              <input className="search-input" value={keySig} onChange={(e) => setKeySig(e.target.value)} placeholder="Key" />
              <input className="search-input" value={tempo} onChange={(e) => setTempo(e.target.value)} placeholder="Tempo" />
            </div>
            <input className="search-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags" />
          </div>

          <div className="sections">
            <div className="sections-header">
              <div className="sections-title">Sections</div>
              <button className="btn-secondary" onClick={addSection}>
                Add Section
              </button>
            </div>

            <textarea
              className="editor-textarea"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder="Paste lyrics to import. Use section headers like [Verse 1], [Chorus], [Bridge]"
              style={{ minHeight: 120 }}
            />
            <div className="editor-actions" style={{ marginTop: 10 }}>
              <button className="btn-secondary" onClick={autoFetchLyrics} disabled={!title.trim() || !artist.trim() || fetchingLyrics}>
                {fetchingLyrics ? 'Fetching…' : 'Auto Fetch Lyrics'}
              </button>
              <button className="btn-secondary" onClick={cleanLyricsWithAi} disabled={!importText.trim() || aiCleaning}>
                {aiCleaning ? 'Cleaning…' : 'AI Clean Lyrics'}
              </button>
              <button className="btn-secondary" onClick={importFromText} disabled={!importText.trim()}>
                Import From Text
              </button>
            </div>

            <div className="sections-list">
              {sections.map((sec, idx) => (
                <div
                  key={sec.id}
                  className={`section-row ${idx === sectionIndex ? 'active' : ''}`}
                  onClick={() => {
                    if (orderLocked && idx !== sectionIndex) return;
                    setSectionIndex(idx);
                  }}
                >
                  <div className="section-meta">
                    <input
                      className="section-label"
                      value={sec.label}
                      onChange={(e) => updateSection(idx, { label: e.target.value })}
                      placeholder="Label"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <select
                      className="section-type"
                      value={sec.type}
                      onChange={(e) => updateSection(idx, { type: e.target.value })}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="verse">Verse</option>
                      <option value="chorus">Chorus</option>
                      <option value="bridge">Bridge</option>
                      <option value="tag">Tag</option>
                      <option value="custom">Custom</option>
                    </select>
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input type="checkbox" checked={!!sec.locked} onChange={(e) => updateSection(idx, { locked: e.target.checked })} />
                      Lock
                    </label>
                    <button className="btn-mini" disabled={orderLocked} onClick={(e) => { e.stopPropagation(); moveSection(idx, -1); }}>
                      ↑
                    </button>
                    <button className="btn-mini" disabled={orderLocked} onClick={(e) => { e.stopPropagation(); moveSection(idx, 1); }}>
                      ↓
                    </button>
                    <button className="btn-mini danger" disabled={orderLocked || sec.locked} onClick={(e) => { e.stopPropagation(); removeSection(idx); }}>
                      ✕
                    </button>
                  </div>
                  {idx === sectionIndex && (
                    <div className="section-editor" onClick={(e) => e.stopPropagation()}>
                      <textarea
                        className="editor-textarea"
                        value={sec.lyrics}
                        onChange={(e) => updateSection(idx, { lyrics: e.target.value })}
                        placeholder="Lyrics (one line per line)"
                      />
                      <textarea
                        className="editor-textarea"
                        value={sec.chords}
                        onChange={(e) => updateSection(idx, { chords: e.target.value })}
                        placeholder="Chords (optional, one line per lyric line)"
                        style={{ minHeight: 120 }}
                      />
                      <div className="editor-actions">
                        <button className="btn-transport" onClick={() => sendSection(idx)}>
                          Send This Section
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="editor-actions">
            <button className="btn-search" disabled={saving} onClick={save}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn-secondary" disabled={saving || selectedId == null} onClick={remove}>
              Delete
            </button>
          </div>

          {status && <div className={`settings-message ${status.ok ? 'ok' : 'error'}`}>{status.message}</div>}
        </div>
      </div>
    </div>
  );
}
