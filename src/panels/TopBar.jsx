import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store.js';
import { BUILTIN_THEMES, FONT_OPTIONS } from '../lib/themes.js';
import {
  Server,
  Settings,
  X,
  Wifi,
  WifiOff,
  BookOpen,
  LayoutGrid,
  Sparkles,
  Globe,
  Info
} from 'lucide-react';

const API_BASE =
  typeof window !== 'undefined' && window.electron?.apiBase
    ? window.electron.apiBase
    : 'http://localhost:3000';

export default function TopBar({ serverStatus }) {
  const { goLive, activeThemeName, setActiveThemeName } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [saveStatus, setSaveStatus] = useState(null);
  const appVersion =
    typeof window !== 'undefined' && window.electron?.appVersion ? String(window.electron.appVersion) : '0.0.0';

  const PfpMark = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="pfp-g" x1="10" y1="10" x2="54" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f2d28a" />
          <stop offset="0.45" stopColor="#d4a853" />
          <stop offset="1" stopColor="#b7832f" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="28" fill="#0b1020" />
      <circle cx="32" cy="32" r="28" fill="none" stroke="url(#pfp-g)" strokeWidth="3.5" />
      <text
        x="32"
        y="38"
        textAnchor="middle"
        fontFamily="DM Sans, Inter, Segoe UI, Arial"
        fontSize="18"
        fontWeight="800"
        letterSpacing="1.2"
        fill="url(#pfp-g)"
      >
        PFP
      </text>
    </svg>
  );

  const [churchName, setChurchName] = useState('');
  const [serverPort, setServerPort] = useState('3000');
  const [networkIp, setNetworkIp] = useState('');
  const [remotePin, setRemotePin] = useState('0000');
  const [remoteEnabled, setRemoteEnabled] = useState(true);
  const [defaultTranslation, setDefaultTranslation] = useState('KJV');
  const [fontFamily, setFontFamily] = useState('Open Sans');
  const [selectedTheme, setSelectedTheme] = useState('Worship');
  const [imageFitMode, setImageFitMode] = useState('original');
  const [bibleImportStatus, setBibleImportStatus] = useState(null);
  const bibleFileInputRef = useRef(null);

  const [aiStatus, setAiStatus] = useState({ keySet: false, model: 'gpt-4o', encryptionAvailable: false });
  const [aiKeyInput, setAiKeyInput] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const keys = [
        'church_name',
        'server_port',
        'remote_pin',
        'remote_enabled',
        'default_translation',
        'font_family',
        'image_fit_mode'
      ].join(',');
      const res = await fetch(`${API_BASE}/api/settings?keys=${encodeURIComponent(keys)}`);
      if (res.ok) {
        const data = await res.json();
        setChurchName(data.church_name || '');
        setServerPort(data.server_port || '3000');
        setRemotePin(data.remote_pin || '0000');
        setRemoteEnabled((data.remote_enabled || 'true') === 'true');
        setDefaultTranslation(data.default_translation || 'KJV');
        setFontFamily(data.font_family || 'Open Sans');
        setImageFitMode((data.image_fit_mode || 'original').trim().toLowerCase() === 'stretch' ? 'stretch' : 'original');
      }
      const netRes = await fetch(`${API_BASE}/api/network`);
      if (netRes.ok) {
        const net = await netRes.json();
        setNetworkIp(net.ip || '');
      }
      const themeRes = await fetch(`${API_BASE}/api/theme`);
      if (themeRes.ok) {
        const theme = await themeRes.json();
        if (theme?.themeName) {
          setSelectedTheme(theme.themeName);
          setActiveThemeName(theme.themeName);
        }
      }
      const aiRes = await fetch(`${API_BASE}/api/ai/status`);
      if (aiRes.ok) setAiStatus(await aiRes.json());
    } catch {}
  }, [setActiveThemeName]);

  useEffect(() => {
    if (settingsOpen) loadSettings();
  }, [settingsOpen, loadSettings]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = async () => {
    setSaveStatus(null);
    try {
      await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            church_name: churchName.trim() || 'My Church',
            remote_pin: remotePin.trim() || '0000',
            remote_enabled: remoteEnabled ? 'true' : 'false',
            default_translation: defaultTranslation.trim() || 'KJV',
            font_family: fontFamily,
            image_fit_mode: imageFitMode === 'stretch' ? 'stretch' : 'original'
          }
        })
      });

      const theme = BUILTIN_THEMES.find((t) => t.name === selectedTheme) || BUILTIN_THEMES[0];
      await fetch(`${API_BASE}/api/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...theme, fontFamily })
      });
      setActiveThemeName(theme.themeName);
      setSaveStatus({ ok: true, message: 'Settings saved' });
    } catch (e) {
      setSaveStatus({ ok: false, message: e.message || 'Save failed' });
    }
  };

  const importBibleFromBrowser = async (fileList) => {
    setBibleImportStatus({ ok: true, message: 'Importing…' });
    try {
      await new Promise((r) => setTimeout(r, 0));
      const files = Array.from(fileList || []).filter((f) => f && typeof f.name === 'string' && f.name.toLowerCase().endsWith('.xml'));
      if (!files.length) throw new Error('No XML files selected');

      const items = [];
      for (const f of files) {
        const xml = await f.text();
        items.push({ fileName: f.name, xml });
      }

      const res = await fetch(`${API_BASE}/api/bible/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Import failed');

      const results = Array.isArray(data?.results) ? data.results : [];
      const ok = results.filter((r) => r?.ok).length || (Number.isFinite(data?.imported) ? data.imported : 0);
      const failed = results.filter((r) => r && !r.ok).length;
      if (!ok && failed) {
        const firstError = results.find((r) => r && !r.ok && r.error)?.error;
        setBibleImportStatus({ ok: false, message: firstError || 'Import failed' });
      } else if (!ok && !failed) {
        setBibleImportStatus({ ok: true, message: 'Import complete' });
      } else {
        setBibleImportStatus({ ok: true, message: `Imported ${ok} file(s)` });
      }
      window.dispatchEvent(new Event('bible-imported'));
    } catch (e) {
      setBibleImportStatus({ ok: false, message: e.message || 'Import failed' });
    } finally {
      try {
        if (bibleFileInputRef.current) bibleFileInputRef.current.value = '';
      } catch {}
    }
  };

  const importBible = async () => {
    if (!window.electron?.selectBibleXmlFiles) {
      bibleFileInputRef.current?.click?.();
      return;
    }
    setBibleImportStatus({ ok: true, message: 'Importing…' });
    try {
      await new Promise((r) => setTimeout(r, 0));
      const files = await window.electron.selectBibleXmlFiles();
      if (!files?.length) return;
      const payload = files.map((filePath) => ({ filePath }));
      const results = await window.electron.importBibleXmlFiles(payload);
      const ok = Array.isArray(results) ? results.filter((r) => r?.ok).length : 0;
      const firstError = Array.isArray(results) ? results.find((r) => r && !r.ok && r.error)?.error : null;
      const failed = Array.isArray(results) ? results.filter((r) => r && !r.ok).length : 0;
      if (!ok && failed && firstError) setBibleImportStatus({ ok: false, message: firstError });
      else if (!ok && !failed) setBibleImportStatus({ ok: true, message: 'Import complete' });
      else setBibleImportStatus({ ok: true, message: `Imported ${ok} file(s)` });
      window.dispatchEvent(new Event('bible-imported'));
    } catch (e) {
      setBibleImportStatus({ ok: false, message: e.message || 'Import failed' });
    }
  };

  const saveAiKey = async () => {
    setAiBusy(true);
    setSaveStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/ai/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: aiKeyInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save key');
      setAiStatus(data);
      setAiKeyInput('');
      setSaveStatus({ ok: true, message: 'API key saved securely' });
    } catch (e) {
      setSaveStatus({ ok: false, message: e.message || 'Key save failed' });
    }
    setAiBusy(false);
  };

  const remoteUrl = networkIp ? `http://${networkIp}:${serverPort}/remote` : '';
  const previewUrl = networkIp ? `http://${networkIp}:${serverPort}/preview` : '';
  const displayUrl = networkIp ? `http://${networkIp}:${serverPort}/display` : '';
  const streamUrl = networkIp ? `http://${networkIp}:${serverPort}/stream` : '';
  const stageUrl = networkIp ? `http://${networkIp}:${serverPort}/stage` : '';
  const preacherUrl = networkIp ? `http://${networkIp}:${serverPort}/preacher` : '';

  const copyText = async (text) => {
    const value = String(text || '').trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setSaveStatus({ ok: true, message: 'Link copied' });
      setTimeout(() => setSaveStatus(null), 1500);
    } catch {
      try {
        const el = document.createElement('textarea');
        el.value = value;
        el.setAttribute('readonly', 'readonly');
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        setSaveStatus({ ok: true, message: 'Link copied' });
        setTimeout(() => setSaveStatus(null), 1500);
      } catch {}
    }
  };

  return (
    <>
      <header className="top-bar">
        <div className="top-bar-brand">
          <div className="top-bar-logo">
            <PfpMark size={18} />
          </div>
          <h1 className="top-bar-title">Pulpit Flow Pro</h1>
          <span className="theme-pill" title="App version" style={{ marginLeft: 10 }}>
            v{appVersion}
          </span>
        </div>

        <div className="top-bar-center">
          <div className={`status-badge ${goLive ? 'live' : 'standby'}`}>
            <span>{goLive ? 'LIVE' : 'STANDBY'}</span>
          </div>
          <span className="theme-pill" title="Active theme">
            {activeThemeName || 'Worship'}
          </span>
          <div className={`server-status-indicator ${serverStatus ? 'online' : 'offline'}`}>
            {serverStatus ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span>Server {serverStatus ? 'Online' : 'Offline'}</span>
          </div>
        </div>

        <div className="top-bar-actions">
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} title="Settings">
            <Settings size={18} />
          </button>
        </div>
      </header>

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Settings</h2>
              <button className="modal-close" onClick={() => setSettingsOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div className="tab-nav">
                <button
                  className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
                  onClick={() => setActiveTab('general')}
                >
                  <Server size={14} />
                  General
                </button>
                <button
                  className={`tab-btn ${activeTab === 'bible' ? 'active' : ''}`}
                  onClick={() => setActiveTab('bible')}
                >
                  <BookOpen size={14} />
                  Bible
                </button>
                <button
                  className={`tab-btn ${activeTab === 'display' ? 'active' : ''}`}
                  onClick={() => setActiveTab('display')}
                >
                  <LayoutGrid size={14} />
                  Display
                </button>
                <button
                  className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
                  onClick={() => setActiveTab('ai')}
                >
                  <Sparkles size={14} />
                  AI
                </button>
                <button
                  className={`tab-btn ${activeTab === 'about' ? 'active' : ''}`}
                  onClick={() => setActiveTab('about')}
                >
                  <Info size={14} />
                  About
                </button>
              </div>

              <div className="tab-content">
                {activeTab === 'general' && (
                  <div className="settings-section">
                    <h3 className="section-title">Church</h3>
                    <div className="form-group">
                      <label className="form-label">Church name</label>
                      <input
                        className="form-input"
                        value={churchName}
                        onChange={(e) => setChurchName(e.target.value)}
                        placeholder="My Church"
                      />
                    </div>

                    <h3 className="section-title">Network & Remote</h3>
                    <div className="form-group">
                      <label className="form-label">
                        <Globe size={14} style={{ display: 'inline', marginRight: 6 }} />
                        Local IP (phones on same Wi‑Fi)
                      </label>
                      <input className="form-input" readOnly value={networkIp || 'Detecting…'} />
                      {remoteUrl && (
                        <p className="form-hint">
                          Remote: <a href={remoteUrl} target="_blank" rel="noreferrer">{remoteUrl}</a>
                          <br />
                          Preview:{' '}
                          <a href={previewUrl} target="_blank" rel="noreferrer">
                            {previewUrl}
                          </a>
                        </p>
                      )}
                    </div>
                    {networkIp && (
                      <div className="form-group">
                        <label className="form-label">Output links (copy into OBS / vMix)</label>
                        <div className="output-links-grid">
                          {[
                            ['Congregation (Display)', displayUrl],
                            ['Stream Overlay', streamUrl],
                            ['Stage Monitor', stageUrl],
                            ['Preacher Monitor', preacherUrl],
                            ['Remote Control', remoteUrl],
                            ['Tech Preview', previewUrl]
                          ].map(([label, url]) => (
                            <div key={label} className="output-link-row">
                              <div className="output-link-meta">
                                <div className="output-link-label">{label}</div>
                                <input className="form-input" readOnly value={url} />
                              </div>
                              <button className="btn btn-secondary output-link-copy" type="button" onClick={() => copyText(url)}>
                                Copy
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Server port</label>
                      <input className="form-input" readOnly value={serverPort} />
                      <span className="form-hint">Change in database settings; restart app to apply.</span>
                    </div>
                    <div className="form-group">
                      <label className="form-label">
                        <input
                          type="checkbox"
                          checked={remoteEnabled}
                          onChange={(e) => setRemoteEnabled(e.target.checked)}
                        />{' '}
                        Enable remote control
                      </label>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Remote PIN (4 digits)</label>
                      <input
                        className="form-input"
                        maxLength={4}
                        value={remotePin}
                        onChange={(e) => setRemotePin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'bible' && (
                  <div className="settings-section">
                    <h3 className="section-title">Default translation</h3>
                    <select
                      className="form-select"
                      value={defaultTranslation}
                      onChange={(e) => setDefaultTranslation(e.target.value)}
                    >
                      {['KJV', 'NIV', 'ESV', 'NKJV', 'AMP', 'NLT', 'ASV', 'RSV'].map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    <h3 className="section-title" style={{ marginTop: 16 }}>
                      Import translations
                    </h3>
                    <p className="section-description">
                      Import Zefania XML Bible files (KJV, NIV, ESV, etc.). Stored locally in SQLite — works offline.
                    </p>
                    <button className="btn btn-primary" type="button" onClick={importBible}>
                      <BookOpen size={16} />
                      Import Bible XML
                    </button>
                    <input
                      ref={bibleFileInputRef}
                      type="file"
                      accept=".xml"
                      multiple
                      style={{ display: 'none' }}
                      onChange={(e) => importBibleFromBrowser(e.target.files)}
                    />
                    {bibleImportStatus && (
                      <div className={`settings-message ${bibleImportStatus.ok ? 'ok' : 'error'}`}>
                        {bibleImportStatus.message}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'display' && (
                  <div className="settings-section">
                    <h3 className="section-title">Live theme</h3>
                    <div className="theme-grid">
                      {BUILTIN_THEMES.map((t) => (
                        <button
                          key={t.name}
                          type="button"
                          className={`theme-card ${selectedTheme === t.name ? 'active' : ''}`}
                          onClick={() => setSelectedTheme(t.name)}
                        >
                          <span className="theme-card-name">{t.name}</span>
                        </button>
                      ))}
                    </div>
                    <div className="form-group" style={{ marginTop: 12 }}>
                      <label className="form-label">Display font</label>
                      <select className="form-select" value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                        {FONT_OPTIONS.map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>

                    <h3 className="section-title" style={{ marginTop: 16 }}>
                      Media images
                    </h3>
                    <div className="form-group">
                      <label className="form-label">Image fit mode</label>
                      <select className="form-select" value={imageFitMode} onChange={(e) => setImageFitMode(e.target.value)}>
                        <option value="original">Original size (no upscale)</option>
                        <option value="stretch">Force 1920×1080 (stretch)</option>
                      </select>
                      <span className="form-hint">
                        Applies to Media image slides on the Congregation output (not theme backgrounds).
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === 'ai' && (
                  <div className="settings-section">
                    <h3 className="section-title">OpenAI (GPT-4o)</h3>
                    <p className="section-description">
                      API key is encrypted on this device. Calls run in the Electron main process only.
                    </p>
                    <div className={`settings-message ${aiStatus.keySet ? 'ok' : ''}`}>
                      Status: {aiStatus.keySet ? 'Key configured' : 'No API key — AI features disabled'}
                      {aiStatus.model && ` · Model: ${aiStatus.model}`}
                      {!aiStatus.encryptionAvailable && ' · Warning: OS encryption unavailable'}
                    </div>
                    <div className="form-group">
                      <label className="form-label">API key</label>
                      <input
                        type="password"
                        className="form-input"
                        value={aiKeyInput}
                        onChange={(e) => setAiKeyInput(e.target.value)}
                        placeholder={aiStatus.keySet ? 'Enter new key to replace' : 'sk-…'}
                        autoComplete="off"
                      />
                    </div>
                    <button className="btn btn-primary" type="button" disabled={aiBusy} onClick={saveAiKey}>
                      {aiBusy ? 'Saving…' : 'Save API Key'}
                    </button>
                    <p className="form-hint" style={{ marginTop: 12 }}>
                      Use Scripture Suggester and Lyric Cleaner in the Bible and Songs panels when a key is set.
                    </p>
                  </div>
                )}

                {activeTab === 'about' && (
                  <div className="settings-section">
                    <h3 className="section-title">Pulpit Flow Pro</h3>
                    <div className="settings-message ok">Version: {appVersion}</div>

                    <h3 className="section-title" style={{ marginTop: 16 }}>
                      Credits
                    </h3>
                    <div className="form-group">
                      <div className="form-hint" style={{ lineHeight: 1.6 }}>
                        Developed by <strong>Noah Abayomi Ogunniran</strong> (CEO, Pinnacle Tech Hub)
                        <br />
                        Phone: <strong>+2347032078859</strong>
                        <br />
                        Email: <a href="mailto:info.pinnacletechhub@gmail.com">info.pinnacletechhub@gmail.com</a>
                      </div>
                    </div>

                    <h3 className="section-title" style={{ marginTop: 16 }}>
                      Support
                    </h3>
                    <div className="form-group">
                      <div className="form-hint">
                        <a href="https://paystack.shop/pay/pfp_support" target="_blank" rel="noreferrer">
                          https://paystack.shop/pay/pfp_support
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {saveStatus && (
                  <div className={`settings-message ${saveStatus.ok ? 'ok' : 'error'}`}>{saveStatus.message}</div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSettingsOpen(false)}>
                Close
              </button>
              <button className="btn btn-primary" onClick={saveSettings}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
