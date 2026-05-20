import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/store.js';

const API_BASE = (typeof window !== 'undefined' && window.electron?.apiBase)
  ? window.electron.apiBase
  : 'http://localhost:3000';

export default function BlockPanel() {
  const { currentBlock, updateServiceBlock, broadcast, stageChordMode, setStageChordMode, toQrDataUrl } = useStore();
  const [translations, setTranslations] = useState(['KJV']);
  const [songs, setSongs] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [mediaItems, setMediaItems] = useState([]);
  const [songSections, setSongSections] = useState([]);
  const [songLoading, setSongLoading] = useState(false);
  const [videoSeekSec, setVideoSeekSec] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/bible/translations`);
        if (!res.ok) return;
        const data = await res.json();
        const list = Array.isArray(data.translations) ? data.translations.filter(Boolean) : [];
        if (list.length) setTranslations(list);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [sRes, aRes] = await Promise.all([
          fetch(`${API_BASE}/api/songs`),
          fetch(`${API_BASE}/api/announcements`)
        ]);
        if (sRes.ok) {
          const sData = await sRes.json();
          setSongs(Array.isArray(sData) ? sData : []);
        }
        if (aRes.ok) {
          const aData = await aRes.json();
          setAnnouncements(Array.isArray(aData) ? aData : []);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/media`);
        if (!res.ok) return;
        const data = await res.json();
        setMediaItems(Array.isArray(data) ? data : []);
      } catch {}
    })();
  }, []);

  const type = currentBlock?.type || null;
  const countdownTotalSec = Number.isFinite(currentBlock?.countdownSec)
    ? Math.max(0, Math.floor(Number(currentBlock.countdownSec) || 0))
    : 0;
  const countdownHours = Math.floor(countdownTotalSec / 3600);
  const countdownMinutes = Math.floor((countdownTotalSec % 3600) / 60);
  const countdownSeconds = countdownTotalSec % 60;

  useEffect(() => {
    if (type !== 'song') return;
    const songId = currentBlock?.songId;
    if (!songId) {
      setSongSections([]);
      return;
    }
    (async () => {
      setSongLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/songs/${songId}`);
        const data = await res.json();
        if (!res.ok) return;
        const secs = Array.isArray(data.sections) ? data.sections : [];
        setSongSections(
          secs
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((s) => ({
              label: s.label || '',
              lyrics: s.lyrics || '',
              chords: s.chords || ''
            }))
        );
      } finally {
        setSongLoading(false);
      }
    })();
  }, [type, currentBlock?.songId]);

  const blockTitle = useMemo(() => {
    if (!currentBlock) return '';
    if (type === 'song') {
      const song = songs.find((s) => s.id === currentBlock.songId);
      return song?.title || currentBlock.title || 'Song';
    }
    if (type === 'announcement') {
      const a = announcements.find((x) => x.id === currentBlock.announcementId);
      return a?.title || currentBlock.title || 'Announcement';
    }
    if (type === 'countdown') return currentBlock.title || 'Countdown';
    if (type === 'giving') return currentBlock.title || 'Giving';
    if (type === 'social') return currentBlock.title || 'Social';
    if (type === 'scripture') return currentBlock.scriptureRef || currentBlock.scripture_ref || 'Scripture';
    if (type === 'video') return currentBlock.title || 'Video';
    if (type === 'media') return currentBlock.title || 'Media';
    if (type === 'blank') return 'Blank';
    return currentBlock.title || 'Block';
  }, [currentBlock, type, songs, announcements]);

  const sendScripture = async () => {
    const reference = String(currentBlock?.scriptureRef || currentBlock?.scripture_ref || '').trim();
    const translation = String(currentBlock?.translation || 'KJV').trim() || 'KJV';
    const second = currentBlock?.secondEnabled ? String(currentBlock?.secondTranslation || '').trim() : '';
    if (!reference) return;
    await fetch(`${API_BASE}/api/verse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, translation, secondTranslation: second || null })
    }).catch(() => {});
  };

  const sendMedia = async () => {
    const bg = String(currentBlock?.backgroundUrl || '').trim();
    if (!bg) return;
    const t = String(currentBlock?.title || '').trim();
    const isVideo =
      bg.toLowerCase().endsWith('.mp4') ||
      bg.toLowerCase().endsWith('.webm') ||
      bg.toLowerCase().endsWith('.mov') ||
      bg.toLowerCase().endsWith('.ogg');
    await broadcast({
      type: 'DISPLAY_SLIDE',
      payload: isVideo
        ? { type: 'video', title: '', body: '', background: bg, state: 'play' }
        : { type: 'media', title: '', body: '', background: bg }
    });
  };

  const sendAnnouncement = async () => {
    const t = String(currentBlock?.title || '').trim();
    const b = String(currentBlock?.body || '').trim();
    if (!t && !b) return;
    await broadcast({
      type: 'DISPLAY_SLIDE',
      payload: {
        title: t,
        body: b,
        background: currentBlock?.backgroundUrl || null,
        duration: currentBlock?.durationSec || null,
        type: 'announcement'
      }
    });
  };

  const sendAnnouncementLowerThird = async () => {
    const t = String(currentBlock?.title || '').trim();
    const b = String(currentBlock?.body || '').trim();
    if (!t && !b) return;
    await broadcast({
      type: 'DISPLAY_SLIDE',
      payload: {
        title: t,
        body: b,
        overlayOnly: true,
        duration: currentBlock?.durationSec || 10,
        type: 'announcement'
      }
    });
  };

  const sendCustom = async () => {
    const t = String(currentBlock?.title || '').trim();
    const b = String(currentBlock?.body || '').trim();
    if (!t && !b) return;
    await broadcast({
      type: 'DISPLAY_SLIDE',
      payload: {
        title: t,
        body: b,
        background: currentBlock?.backgroundUrl || null,
        duration: currentBlock?.durationSec || null,
        type: 'custom'
      }
    });
  };

  const sendVideo = async () => {
    const bg = String(currentBlock?.backgroundUrl || '').trim();
    if (!bg) return;
    await broadcast({ type: 'DISPLAY_SLIDE', payload: { title: '', body: '', background: bg, type: 'video', state: 'play' } });
  };

  const sendCountdown = async () => {
    const t = String(currentBlock?.title || '').trim() || 'Service begins in';
    const sec = Number.isFinite(currentBlock?.countdownSec) ? currentBlock.countdownSec : 0;
    const durationSec = Math.max(1, Math.floor(Number(sec) || 0));
    await broadcast({
      type: 'DISPLAY_SLIDE',
      payload: { title: t, body: '', background: currentBlock?.backgroundUrl || null, type: 'countdown', durationSec, startedAt: Date.now() }
    });
  };

  const sendGiving = async () => {
    const t = String(currentBlock?.title || '').trim() || 'Give Online';
    const url = String(currentBlock?.givingUrl || '').trim();
    if (!url) return;
    const qrDataUrl = await toQrDataUrl(url);
    await broadcast({
      type: 'DISPLAY_SLIDE',
      payload: {
        title: t,
        body: String(currentBlock?.body || '').trim(),
        background: currentBlock?.backgroundUrl || null,
        type: 'giving',
        givingUrl: url,
        qrDataUrl
      }
    });
  };

  const sendSocial = async () => {
    const t = String(currentBlock?.title || '').trim() || 'Follow Us';
    const platform = String(currentBlock?.socialPlatform || 'Instagram').trim() || 'Instagram';
    const handle = String(currentBlock?.socialHandle || '').trim();
    await broadcast({
      type: 'DISPLAY_SLIDE',
      payload: { title: t, body: handle, background: currentBlock?.backgroundUrl || null, type: 'social', platform, handle }
    });
  };

  const sendNotes = async () => {
    await broadcast({ type: 'PREACHER_NOTE', payload: { note: String(currentBlock?.notes || '') } });
  };

  const sendBlank = async () => {
    await fetch(`${API_BASE}/api/blank`, { method: 'POST' }).catch(() => {});
  };

  const sendSong = async () => {
    const idx = Number.isFinite(currentBlock?.sectionIndex) ? currentBlock.sectionIndex : 0;
    const sec = songSections[idx];
    if (!sec) return;
    const next = songSections[idx + 1] || null;
    const lines = String(sec.lyrics || '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0);
    const nextLines = next ? String(next.lyrics || '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.length > 0) : [];
    const songTitle = songs.find((s) => s.id === currentBlock.songId)?.title || currentBlock.title || '';
    const artist = songs.find((s) => s.id === currentBlock.songId)?.artist || '';
    const chordsLines = String(sec.chords || '').split(/\r?\n/).map((l) => l.trimEnd());
    await broadcast({
      type: 'DISPLAY_LYRICS',
      payload: {
        songTitle,
        artist,
        sectionLabel: sec.label || '',
        lines,
        nextSectionLabel: next?.label || '',
        nextLines,
        chordsLines
      }
    });
  };

  if (!currentBlock) {
    return (
      <div className="center-panel-inner">
        <div className="empty-state">Select a service block to edit</div>
      </div>
    );
  }

  return (
    <div className="center-panel-inner">
      <div className="panel-subtitle">{type?.toUpperCase() || 'BLOCK'} — {blockTitle}</div>

      {type === 'scripture' && (
        <div className="block-editor">
          <input
            className="search-input"
            value={currentBlock.scriptureRef || currentBlock.scripture_ref || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { scriptureRef: e.target.value })}
            placeholder="e.g., John 3:16"
          />

          <select
            className="translation-select"
            value={currentBlock.translation || 'KJV'}
            onChange={(e) => updateServiceBlock(currentBlock.id, { translation: e.target.value })}
          >
            {translations.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#DDD' }}>
              <input
                type="checkbox"
                checked={!!currentBlock.secondEnabled}
                onChange={(e) => updateServiceBlock(currentBlock.id, { secondEnabled: e.target.checked })}
              />
              Second translation
            </label>
            {!!currentBlock.secondEnabled && (
              <select
                className="translation-select"
                style={{ marginBottom: 0 }}
                value={currentBlock.secondTranslation || 'NKJV'}
                onChange={(e) => updateServiceBlock(currentBlock.id, { secondTranslation: e.target.value })}
              >
                {translations.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="editor-actions">
            <button className="btn-transport" onClick={sendScripture}>
              Send Live
            </button>
          </div>
        </div>
      )}

      {type === 'song' && (
        <div className="block-editor">
          <select
            className="translation-select"
            value={currentBlock.songId || ''}
            onChange={(e) => {
              const id = Number(e.target.value) || null;
              const song = songs.find((s) => s.id === id);
              updateServiceBlock(currentBlock.id, { songId: id, sectionIndex: 0, title: song?.title || currentBlock.title || '' });
            }}
          >
            <option value="">Select song...</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
            <input type="checkbox" checked={!!stageChordMode} onChange={(e) => setStageChordMode(e.target.checked)} />
            Stage chord mode
          </label>

          <div className="editor-row">
            <button
              className="btn-mini"
              onClick={() => updateServiceBlock(currentBlock.id, { sectionIndex: Math.max(0, (currentBlock.sectionIndex || 0) - 1) })}
            >
              Prev Section
            </button>
            <button
              className="btn-mini"
              onClick={() =>
                updateServiceBlock(currentBlock.id, {
                  sectionIndex: Math.min(songSections.length - 1, (currentBlock.sectionIndex || 0) + 1)
                })
              }
            >
              Next Section
            </button>
            <button className="btn-transport" disabled={!currentBlock.songId || songLoading} onClick={sendSong}>
              Send Live
            </button>
          </div>

          <div className="preview-area" style={{ marginTop: 12 }}>
            <div className="preview-label">Section Preview</div>
            <div className="preview-content">
              {songLoading ? (
                <span>Loading...</span>
              ) : songSections.length === 0 ? (
                <span>No sections</span>
              ) : (
                <>
                  <div className="preview-reference">{songSections[currentBlock.sectionIndex || 0]?.label || ''}</div>
                  <div className="preview-verse">{songSections[currentBlock.sectionIndex || 0]?.lyrics || ''}</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {type === 'announcement' && (
        <div className="block-editor">
          <select
            className="translation-select"
            value={currentBlock.announcementId || ''}
            onChange={(e) => {
              const id = Number(e.target.value) || null;
              const a = announcements.find((x) => x.id === id);
              updateServiceBlock(currentBlock.id, {
                announcementId: id,
                title: a?.title || '',
                body: a?.body || '',
                backgroundUrl: a?.background_url || a?.backgroundUrl || '',
                durationSec: Number(a?.duration_sec || a?.durationSec || 0) || 0
              });
            }}
          >
            <option value="">Select announcement...</option>
            {announcements.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>

          <select
            className="translation-select"
            value={currentBlock.backgroundUrl || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { backgroundUrl: e.target.value })}
          >
            <option value="">No background</option>
            {mediaItems.map((m) => (
              <option key={m.id} value={m.url}>
                {(m.type === 'video' ? '[Video] ' : '[Image] ') + (m.name || 'Untitled')}
              </option>
            ))}
          </select>

          <input
            className="search-input"
            value={String(currentBlock.durationSec || '')}
            onChange={(e) => updateServiceBlock(currentBlock.id, { durationSec: Number(e.target.value) || 0 })}
            placeholder="Duration seconds (optional)"
          />

          <input
            className="search-input"
            value={currentBlock.title || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { title: e.target.value })}
            placeholder="Title"
          />
          <textarea
            className="editor-textarea"
            value={currentBlock.body || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { body: e.target.value })}
            placeholder="Body"
          />

          <div className="editor-actions">
            <button className="btn-transport" onClick={sendAnnouncement}>
              Send Live
            </button>
            <button className="btn-secondary" onClick={sendAnnouncementLowerThird}>
              Lower-third
            </button>
          </div>
        </div>
      )}

      {type === 'countdown' && (
        <div className="block-editor">
          <select
            className="translation-select"
            value={currentBlock.backgroundUrl || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { backgroundUrl: e.target.value })}
          >
            <option value="">No background</option>
            {mediaItems.map((m) => (
              <option key={m.id} value={m.url}>
                {(m.type === 'video' ? '[Video] ' : '[Image] ') + (m.name || 'Untitled')}
              </option>
            ))}
          </select>
          <input
            className="search-input"
            value={currentBlock.title || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { title: e.target.value })}
            placeholder="Title (e.g., Service begins in)"
          />
          <div className="editor-row" style={{ gap: 10 }}>
            <input
              className="search-input"
              type="number"
              min={0}
              value={String(countdownHours)}
              onChange={(e) => {
                const h = Math.max(0, Math.floor(Number(e.target.value) || 0));
                const total = h * 3600 + countdownMinutes * 60 + countdownSeconds;
                updateServiceBlock(currentBlock.id, { countdownSec: total });
              }}
              placeholder="Hours"
            />
            <input
              className="search-input"
              type="number"
              min={0}
              value={String(countdownMinutes)}
              onChange={(e) => {
                const m = Math.max(0, Math.floor(Number(e.target.value) || 0));
                const total = countdownHours * 3600 + m * 60 + countdownSeconds;
                updateServiceBlock(currentBlock.id, { countdownSec: total });
              }}
              placeholder="Minutes"
            />
            <input
              className="search-input"
              type="number"
              min={0}
              value={String(countdownSeconds)}
              onChange={(e) => {
                const s = Math.max(0, Math.floor(Number(e.target.value) || 0));
                const total = countdownHours * 3600 + countdownMinutes * 60 + s;
                updateServiceBlock(currentBlock.id, { countdownSec: total });
              }}
              placeholder="Seconds"
            />
          </div>
          <div className="editor-actions">
            <button className="btn-transport" onClick={sendCountdown}>
              Start Countdown
            </button>
          </div>
        </div>
      )}

      {type === 'giving' && (
        <div className="block-editor">
          <select
            className="translation-select"
            value={currentBlock.backgroundUrl || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { backgroundUrl: e.target.value })}
          >
            <option value="">No background</option>
            {mediaItems.map((m) => (
              <option key={m.id} value={m.url}>
                {(m.type === 'video' ? '[Video] ' : '[Image] ') + (m.name || 'Untitled')}
              </option>
            ))}
          </select>
          <input
            className="search-input"
            value={currentBlock.title || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { title: e.target.value })}
            placeholder="Title (e.g., Give Online)"
          />
          <input
            className="search-input"
            value={currentBlock.givingUrl || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { givingUrl: e.target.value })}
            placeholder="Giving URL"
          />
          <textarea
            className="editor-textarea"
            value={currentBlock.body || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { body: e.target.value })}
            placeholder="Text (optional)"
          />
          <div className="editor-actions">
            <button className="btn-transport" onClick={sendGiving}>
              Send Live
            </button>
          </div>
        </div>
      )}

      {type === 'social' && (
        <div className="block-editor">
          <select
            className="translation-select"
            value={currentBlock.backgroundUrl || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { backgroundUrl: e.target.value })}
          >
            <option value="">No background</option>
            {mediaItems.map((m) => (
              <option key={m.id} value={m.url}>
                {(m.type === 'video' ? '[Video] ' : '[Image] ') + (m.name || 'Untitled')}
              </option>
            ))}
          </select>
          <input
            className="search-input"
            value={currentBlock.title || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { title: e.target.value })}
            placeholder="Title (e.g., Follow Us)"
          />
          <select
            className="translation-select"
            value={currentBlock.socialPlatform || 'Instagram'}
            onChange={(e) => updateServiceBlock(currentBlock.id, { socialPlatform: e.target.value })}
          >
            {['Instagram', 'Facebook', 'YouTube', 'X', 'TikTok'].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            className="search-input"
            value={currentBlock.socialHandle || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { socialHandle: e.target.value })}
            placeholder="@handle or page name"
          />
          <div className="editor-actions">
            <button className="btn-transport" onClick={sendSocial}>
              Send Live
            </button>
          </div>
        </div>
      )}

      {type === 'custom' && (
        <div className="block-editor">
          <select
            className="translation-select"
            value={currentBlock.backgroundUrl || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { backgroundUrl: e.target.value })}
          >
            <option value="">No background</option>
            {mediaItems.map((m) => (
              <option key={m.id} value={m.url}>
                {(m.type === 'video' ? '[Video] ' : '[Image] ') + (m.name || 'Untitled')}
              </option>
            ))}
          </select>
          <input
            className="search-input"
            value={String(currentBlock.durationSec || '')}
            onChange={(e) => updateServiceBlock(currentBlock.id, { durationSec: Number(e.target.value) || 0 })}
            placeholder="Duration seconds (optional)"
          />
          <input
            className="search-input"
            value={currentBlock.title || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { title: e.target.value })}
            placeholder="Title"
          />
          <textarea
            className="editor-textarea"
            value={currentBlock.body || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { body: e.target.value })}
            placeholder="Body"
          />
          <div className="editor-actions">
            <button className="btn-transport" onClick={sendCustom}>
              Send Live
            </button>
          </div>
        </div>
      )}

      {type === 'video' && (
        <div className="block-editor">
          <select
            className="translation-select"
            value={currentBlock.backgroundUrl || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { backgroundUrl: e.target.value })}
          >
            <option value="">Select video...</option>
            {mediaItems.filter((m) => m.type === 'video').map((m) => (
              <option key={m.id} value={m.url}>
                {m.name || 'Untitled'}
              </option>
            ))}
          </select>
          <input
            className="search-input"
            value={currentBlock.title || ''}
            onChange={(e) => updateServiceBlock(currentBlock.id, { title: e.target.value })}
            placeholder="Title (optional)"
          />
          <input
            className="search-input"
            value={videoSeekSec}
            onChange={(e) => setVideoSeekSec(e.target.value)}
            placeholder="Seek seconds (e.g., 30)"
          />
          <div className="editor-actions">
            <button className="btn-transport" onClick={sendVideo}>
              Play Video
            </button>
            <button className="btn-secondary" onClick={() => broadcast({ type: 'DISPLAY_SLIDE', payload: { type: 'video', state: 'pause' } })}>
              Pause
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                const v = Number(videoSeekSec);
                if (!Number.isFinite(v) || v < 0) return;
                broadcast({ type: 'DISPLAY_SLIDE', payload: { type: 'video', state: 'seek', timeSec: v } });
              }}
            >
              Seek
            </button>
            <button className="btn-secondary" onClick={() => broadcast({ type: 'DISPLAY_SLIDE', payload: { type: 'video', state: 'stop' } })}>
              Stop
            </button>
          </div>
        </div>
      )}

      {type === 'media' && (
        <div className="block-editor">
          <select
            className="translation-select"
            value={String(currentBlock.mediaId || '')}
            onChange={(e) => {
              const id = Number(e.target.value) || null;
              const m = mediaItems.find((x) => x.id === id) || null;
              updateServiceBlock(currentBlock.id, {
                mediaId: id,
                backgroundUrl: m?.url || '',
                title: m?.name || (m?.type === 'video' ? 'Video' : 'Media')
              });
            }}
          >
            <option value="">Select media...</option>
            {mediaItems.map((m) => (
              <option key={m.id} value={m.id}>
                {(m.type === 'video' ? '[Video] ' : '[Image] ') + (m.name || 'Untitled')}
              </option>
            ))}
          </select>

          {String(currentBlock.backgroundUrl || '').toLowerCase().match(/\.(mp4|webm|mov|ogg)$/) ? (
            <>
              <input
                className="search-input"
                value={currentBlock.title || ''}
                onChange={(e) => updateServiceBlock(currentBlock.id, { title: e.target.value })}
                placeholder="Title (optional)"
              />
              <input
                className="search-input"
                value={videoSeekSec}
                onChange={(e) => setVideoSeekSec(e.target.value)}
                placeholder="Seek seconds (e.g., 30)"
              />
              <div className="editor-actions">
                <button className="btn-transport" onClick={sendMedia}>
                  Play Video
                </button>
                <button className="btn-secondary" onClick={() => broadcast({ type: 'DISPLAY_SLIDE', payload: { type: 'video', state: 'pause' } })}>
                  Pause
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    const v = Number(videoSeekSec);
                    if (!Number.isFinite(v) || v < 0) return;
                    broadcast({ type: 'DISPLAY_SLIDE', payload: { type: 'video', state: 'seek', timeSec: v } });
                  }}
                >
                  Seek
                </button>
                <button className="btn-secondary" onClick={() => broadcast({ type: 'DISPLAY_SLIDE', payload: { type: 'video', state: 'stop' } })}>
                  Stop
                </button>
              </div>
            </>
          ) : (
            <div className="editor-actions">
              <button className="btn-transport" onClick={sendMedia}>
                Send Live
              </button>
            </div>
          )}
        </div>
      )}

      {type === 'blank' && (
        <div className="block-editor">
          <div className="editor-actions">
            <button className="btn-danger" onClick={sendBlank}>
              Blank All
            </button>
          </div>
        </div>
      )}

      <div className="block-editor">
        <div className="preview-label">Notes</div>
        <textarea
          className="editor-textarea"
          value={currentBlock.notes || ''}
          onChange={(e) => updateServiceBlock(currentBlock.id, { notes: e.target.value })}
          placeholder="Private notes for preacher monitor"
        />
        <div className="editor-actions">
          <button className="btn-secondary" onClick={sendNotes}>
            Send Notes
          </button>
        </div>
      </div>
    </div>
  );
}
