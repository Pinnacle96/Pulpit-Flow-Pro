import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/store.js';
import { Plus, Trash2, Save, Search, Bell, Image, Clock, Play, Pause, UploadCloud, X } from 'lucide-react';

const API_BASE = (typeof window !== 'undefined' && window.electron?.apiBase)
  ? window.electron.apiBase
  : 'http://localhost:3000';

export default function AnnouncementsPanel() {
  const { broadcast, goLive } = useStore();
  const [query, setQuery] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [durationSec, setDurationSec] = useState(10);

  const [playlistIds, setPlaylistIds] = useState([]);
  const [playlistRunning, setPlaylistRunning] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [media, setMedia] = useState([]);
  const [mediaQuery, setMediaQuery] = useState('');
  const fileInputRef = useRef(null);

  const selected = useMemo(() => announcements.find((a) => a.id === selectedId) || null, [announcements, selectedId]);

  const loadAnnouncements = async (q = query) => {
    setLoading(true);
    setStatus(null);
    try {
      const url = new URL(`${API_BASE}/api/announcements`);
      if (q.trim()) url.searchParams.set('q', q.trim());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to load announcements');
      const data = await res.json();
      setAnnouncements(Array.isArray(data) ? data : []);
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Load failed' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements('');
  }, []);

  const loadMedia = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/media`);
      if (!res.ok) return;
      const data = await res.json();
      setMedia(Array.isArray(data) ? data : []);
    } catch {}
  };

  const importMedia = async () => {
    setStatus(null);
    if (!window.electron?.selectMediaFiles || !window.electron?.importMediaFiles) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
        fileInputRef.current.click();
        return;
      }
      setStatus({ ok: false, message: 'Import unavailable' });
      return;
    }
    try {
      const files = await window.electron.selectMediaFiles();
      if (!files?.length) return;
      const allowed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
      const imageFiles = files.filter((p) => {
        const s = String(p || '').toLowerCase();
        const dot = s.lastIndexOf('.');
        const ext = dot >= 0 ? s.slice(dot) : '';
        return allowed.has(ext);
      });
      if (!imageFiles.length) {
        setStatus({ ok: false, message: 'Announcement backgrounds support images only (PNG/JPG/WEBP/GIF).' });
        return;
      }
      if (imageFiles.length !== files.length) {
        setStatus({ ok: false, message: 'Videos are skipped here. Use the Media tab to import videos.' });
      }
      await window.electron.importMediaFiles(imageFiles);
      await loadMedia();
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Import failed' });
    }
  };

  const importMediaFromBrowser = async (files) => {
    const list = Array.from(files || []).slice(0, 10);
    if (!list.length) return;
    setStatus(null);
    try {
      const items = [];
      for (const f of list) {
        const mime = String(f.type || '').toLowerCase();
        if (!mime.startsWith('image/')) continue;
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        const base64 = btoa(bin);
        items.push({ name: f.name.replace(/\.[^/.]+$/, ''), fileName: f.name, mime, dataBase64: base64 });
      }
      if (!items.length) {
        setStatus({ ok: false, message: 'Only images can be imported in browser mode' });
        return;
      }
      const res = await fetch(`${API_BASE}/api/media/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import failed');
      await loadMedia();
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Import failed' });
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    const a = announcements.find((x) => x.id === selectedId);
    if (!a) return;
    setTitle(a.title || '');
    setContent(a.body || a.content || '');
    setBackgroundUrl(a.background_url || a.backgroundUrl || '');
    setDurationSec(a.duration_sec || a.durationSec || 10);
  }, [selectedId, announcements]);

  const createNew = () => {
    setSelectedId(null);
    setTitle('');
    setContent('');
    setBackgroundUrl('');
    setDurationSec(10);
    setStatus(null);
  };

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        title: title.trim(),
        body: content.trim(),
        background_url: backgroundUrl.trim(),
        duration_sec: Number(durationSec) || 10
      };
      if (!payload.title) throw new Error('Title is required');
      if (!payload.body) throw new Error('Content is required');

      let id = selectedId;
      if (id == null) {
        const res = await fetch(`${API_BASE}/api/announcements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Create failed');
        id = Number(data.id);
        setSelectedId(id);
      } else {
        const res = await fetch(`${API_BASE}/api/announcements/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Update failed');
      }

      await loadAnnouncements();
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
      const res = await fetch(`${API_BASE}/api/announcements/${selectedId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Delete failed');
      await loadAnnouncements();
      createNew();
      setStatus({ ok: true, message: 'Deleted' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Delete failed' });
    } finally {
      setSaving(false);
    }
  };

  const sendLive = async () => {
    if (!selected) return;
    const t = selected.title || 'Announcement';
    const b = selected.body || '';
    await broadcast({
      type: 'DISPLAY_SLIDE',
      payload: {
        title: t,
        body: b,
        type: 'announcement',
        background: selected.background_url || null
      }
    });
  };

  const toggleInPlaylist = (id) => {
    setPlaylistIds((prev) => {
      const exists = prev.includes(id);
      if (exists) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const startPlaylist = async () => {
    if (!playlistIds.length) return;
    try {
      const res = await fetch(`${API_BASE}/api/announcements/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: playlistIds, start: true })
      });
      if (res.ok) setPlaylistRunning(true);
    } catch {}
  };

  const stopPlaylist = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/announcements/playlist/stop`, { method: 'POST' });
      if (res.ok) setPlaylistRunning(false);
    } catch {}
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
              placeholder="Search announcements..."
            />
            <button className="btn-search" onClick={() => loadAnnouncements()}>
              {loading ? 'Loading...' : 'Search'}
            </button>
          </div>

          <button className="btn-secondary" onClick={createNew}>
            <Plus size={16} />
            New Announcement
          </button>

          <div className="item-list">
            {announcements.map((a) => (
              <div key={a.id} className={`item-row ${selectedId === a.id ? 'active' : ''}`} onClick={() => setSelectedId(a.id)}>
                <div className="item-title">{a.title}</div>
                <div className="item-sub">{a.body?.slice(0, 80) || ''}</div>
                <label className="item-check" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={playlistIds.includes(a.id)} onChange={() => toggleInPlaylist(a.id)} />
                  Playlist
                </label>
              </div>
            ))}
            {!loading && announcements.length === 0 && <div className="empty-state">No announcements found</div>}
          </div>

          <div className="playlist-controls">
            <button className="btn-secondary" onClick={startPlaylist} disabled={!playlistIds.length || playlistRunning}>
              <Play size={16} />
              Start Playlist
            </button>
            <button className="btn-danger" onClick={stopPlaylist} disabled={!playlistRunning}>
              <Pause size={16} />
              Stop Playlist
            </button>
          </div>
        </div>

        <div className="center-editor">
          <div className="editor-grid">
            <input className="search-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
            <textarea className="editor-textarea" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Content" />
            <div className="editor-row">
              <div style={{ display: 'flex', gap: 10, width: '100%' }}>
                <input
                  className="search-input"
                  value={backgroundUrl}
                  onChange={(e) => setBackgroundUrl(e.target.value)}
                  placeholder="Background image URL (or pick from Media)"
                />
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={async () => {
                    await loadMedia();
                    setMediaQuery('');
                    setMediaPickerOpen(true);
                  }}
                  title="Pick from media library"
                >
                  <Image size={16} />
                  Pick
                </button>
              </div>
              <input className="search-input" type="number" value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} placeholder="Duration (sec)" />
            </div>
          </div>

          <div className="editor-actions">
            <button className="btn-search" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn-secondary" onClick={remove} disabled={saving || selectedId == null}>
              Delete
            </button>
            <button className="btn-primary" onClick={sendLive} disabled={!selected || !goLive}>
              Send Live
            </button>
          </div>

          {status && <div className={`status-message ${status.ok ? 'success' : 'error'}`}>{status.message}</div>}
        </div>
      </div>

      {mediaPickerOpen && (
        <div className="modal-backdrop" onClick={() => setMediaPickerOpen(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Pick background media</h2>
              <button className="modal-close" onClick={() => setMediaPickerOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => importMediaFromBrowser(e.target.files)}
              />
              <div className="center-toolbar" style={{ padding: 0, marginBottom: 12 }}>
                <input
                  className="search-input"
                  placeholder="Search media…"
                  value={mediaQuery}
                  onChange={(e) => setMediaQuery(e.target.value)}
                />
                <button className="btn-secondary" type="button" onClick={importMedia}>
                  <UploadCloud size={16} />
                  Import
                </button>
              </div>

              <div className="preview-grid">
                {media
                  .filter((m) => String(m?.type || '').toLowerCase() !== 'video')
                  .filter((m) => {
                    const q = mediaQuery.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      String(m?.name || '').toLowerCase().includes(q) ||
                      String(m?.fileName || '').toLowerCase().includes(q)
                    );
                  })
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className="preview-tile"
                      onClick={() => {
                        setBackgroundUrl(m.url || '');
                        setMediaPickerOpen(false);
                      }}
                      title={m.name || m.fileName || 'Media'}
                    >
                      <div className="preview-frame">
                        <iframe title={m.name || m.fileName || 'media'} src={`${API_BASE}${m.url}`} />
                      </div>
                      <div className="preview-meta">
                        <div className="preview-label">{m.name || m.fileName || 'Media'}</div>
                      </div>
                    </button>
                  ))}
                {!media.filter((m) => String(m?.type || '').toLowerCase() !== 'video').length && (
                  <div className="empty-state">No images yet. Click Import to add images.</div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setMediaPickerOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
