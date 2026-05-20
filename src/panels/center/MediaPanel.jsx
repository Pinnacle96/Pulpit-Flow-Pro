import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/store.js';
import { Image as ImageIcon, Film, Trash2, UploadCloud, Paintbrush, Send, RefreshCw, Play, Pause, XCircle } from 'lucide-react';

const API_BASE = typeof window !== 'undefined' && window.electron?.apiBase ? window.electron.apiBase : 'http://localhost:3000';

function isVideoType(item) {
  const t = String(item?.type || '').toLowerCase();
  if (t === 'video') return true;
  const name = String(item?.fileName || '').toLowerCase();
  return name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov') || name.endsWith('.ogg');
}

export default function MediaPanel() {
  const { goLive, broadcast } = useStore();
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [playlistIds, setPlaylistIds] = useState([]);
  const [playlistRunning, setPlaylistRunning] = useState(false);
  const [playlistIntervalSec, setPlaylistIntervalSec] = useState(8);
  const fileInputRef = useRef(null);

  const loadMedia = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/media`);
      if (!res.ok) return;
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => {
    loadMedia();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((m) => {
      const name = String(m?.name || '').toLowerCase();
      const fileName = String(m?.fileName || '').toLowerCase();
      return name.includes(q) || fileName.includes(q);
    });
  }, [items, query]);

  const selected = useMemo(() => items.find((m) => m.id === selectedId) || null, [items, selectedId]);

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
    setBusy(true);
    try {
      const files = await window.electron.selectMediaFiles();
      if (!files?.length) {
        setBusy(false);
        return;
      }
      const results = await window.electron.importMediaFiles(files);
      const ok = Array.isArray(results) ? results.filter((r) => r?.ok).length : 0;
      setStatus({ ok: true, message: `Imported ${ok} item(s)` });
      await loadMedia();
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Import failed' });
    }
    setBusy(false);
  };

  const importMediaFromBrowser = async (files) => {
    const list = Array.from(files || []).slice(0, 6);
    if (!list.length) return;
    setBusy(true);
    setStatus(null);
    try {
      const items = [];
      for (const f of list) {
        const mime = String(f.type || '').toLowerCase();
        const nameLower = String(f.name || '').toLowerCase();
        const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/.test(nameLower);
        const isVideo = mime.startsWith('video/') || /\.(mp4|webm|mov|ogg)$/.test(nameLower);
        if (!isImage && !isVideo) continue;
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.onload = () => {
            const s = String(reader.result || '');
            const comma = s.indexOf(',');
            if (comma < 0) return reject(new Error('Invalid file encoding'));
            resolve(s.slice(comma + 1));
          };
          reader.readAsDataURL(f);
        });
        items.push({ name: f.name.replace(/\.[^/.]+$/, ''), fileName: f.name, mime, dataBase64: base64 });
      }
      if (!items.length) {
        setStatus({ ok: false, message: 'Only images/videos can be imported' });
        setBusy(false);
        return;
      }
      const res = await fetch(`${API_BASE}/api/media/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import failed');
      setStatus({ ok: true, message: `Imported ${Array.isArray(data.items) ? data.items.length : 0} item(s)` });
      await loadMedia();
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Import failed' });
    }
    setBusy(false);
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
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/media/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: playlistIds, start: true, intervalSec: Number(playlistIntervalSec) || 8 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to start playlist');
      setPlaylistRunning(true);
      setStatus({ ok: true, message: 'Playlist started' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Playlist start failed' });
    }
    setBusy(false);
  };

  const stopPlaylist = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/media/playlist/stop`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to stop playlist');
      setPlaylistRunning(false);
      setStatus({ ok: true, message: 'Playlist stopped' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Playlist stop failed' });
    }
    setBusy(false);
  };

  const removeSelected = async () => {
    if (!selected) return;
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/media/${selected.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setSelectedId(null);
      await loadMedia();
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Delete failed' });
    }
    setBusy(false);
  };

  const setAsBackground = async () => {
    if (!selected?.url) return;
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundUrl: selected.url })
      });
      if (!res.ok) throw new Error('Failed to set background');
      setStatus({ ok: true, message: 'Background updated' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Background update failed' });
    }
    setBusy(false);
  };

  const clearBackground = async () => {
    setStatus(null);
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backgroundUrl: null })
      });
      if (!res.ok) throw new Error('Failed to clear background');
      setStatus({ ok: true, message: 'Background cleared' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Background clear failed' });
    }
    setBusy(false);
  };

  const sendLive = async () => {
    if (!selected?.url) return;
    setStatus(null);
    setBusy(true);
    try {
      if (isVideoType(selected)) {
        await broadcast({
          type: 'DISPLAY_SLIDE',
          payload: { type: 'video', title: '', body: '', background: selected.url, state: 'play' }
        });
      } else {
        await broadcast({
          type: 'DISPLAY_SLIDE',
          payload: { type: 'media', title: '', body: '', background: selected.url }
        });
      }
      setStatus({ ok: true, message: 'Sent live' });
    } catch (e) {
      setStatus({ ok: false, message: e.message || 'Send failed' });
    }
    setBusy(false);
  };

  return (
    <div className="center-split">
      <div className="center-list">
        <div className="center-toolbar">
          <input
            className="search-input"
            placeholder="Search media…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn-secondary" type="button" onClick={loadMedia} disabled={busy}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="btn-secondary" type="button" onClick={importMedia} disabled={busy}>
            <UploadCloud size={16} />
            Import
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => importMediaFromBrowser(e.target.files)}
        />

        <div className="item-list">
          {filtered.map((m) => {
            const video = isVideoType(m);
            const Icon = video ? Film : ImageIcon;
            return (
              <div
                key={m.id}
                className={`item-row ${selectedId === m.id ? 'active' : ''}`}
                onClick={() => setSelectedId(m.id)}
              >
                <div className="item-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon size={16} />
                  <span>{m.name || m.fileName || 'Media'}</span>
                </div>
                <div className="item-sub">{m.fileName || ''}</div>
                <label className="item-check" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={playlistIds.includes(m.id)}
                    onChange={() => toggleInPlaylist(m.id)}
                  />
                  Playlist
                </label>
              </div>
            );
          })}
          {!filtered.length && <div className="empty-state">No media found</div>}
        </div>

        <div className="playlist-controls">
          <input
            className="search-input"
            value={String(playlistIntervalSec)}
            onChange={(e) => setPlaylistIntervalSec(Number(e.target.value) || 8)}
            placeholder="Interval seconds"
          />
          <button className="btn-secondary" onClick={startPlaylist} disabled={!playlistIds.length || playlistRunning || busy}>
            <Play size={16} />
            Start Playlist
          </button>
          <button className="btn-danger" onClick={stopPlaylist} disabled={!playlistRunning || busy}>
            <Pause size={16} />
            Stop Playlist
          </button>
        </div>
      </div>

      <div className="center-editor">
        <div className="editor-grid">
          {!selected && <div className="empty-state">Select a media item to preview</div>}
          {selected && (
            <>
              <div className="card" style={{ padding: 12 }}>
                <div className="card-title" style={{ marginBottom: 10 }}>
                  {selected.name || selected.fileName || 'Media'}
                </div>
                <div style={{ borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.04)' }}>
                  {isVideoType(selected) ? (
                    <video
                      src={selected.url}
                      controls
                      style={{ width: '100%', height: 260, objectFit: 'contain', display: 'block' }}
                    />
                  ) : (
                    <img
                      src={selected.url}
                      alt=""
                      style={{ width: '100%', height: 260, objectFit: 'contain', display: 'block' }}
                    />
                  )}
                </div>
                <div className="form-hint" style={{ marginTop: 10 }}>
                  URL: <span style={{ userSelect: 'text' }}>{selected.url}</span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="editor-actions">
          <button className="btn-secondary" type="button" onClick={setAsBackground} disabled={!selected || busy}>
            <Paintbrush size={16} />
            Set Background
          </button>
          <button className="btn-secondary" type="button" onClick={clearBackground} disabled={busy}>
            Clear Background
          </button>
          <button className="btn-danger" type="button" onClick={removeSelected} disabled={!selected || busy}>
            <Trash2 size={16} />
            Delete
          </button>
          <button className="btn-primary" type="button" onClick={sendLive} disabled={!selected || busy || !goLive}>
            <Send size={16} />
            Send Live
          </button>
        </div>

        {status && <div className={`status-message ${status.ok ? 'success' : 'error'}`}>{status.message}</div>}
        {!goLive && <div className="status-message error">Go Live is OFF — enable to send media live</div>}
      </div>
    </div>
  );
}

