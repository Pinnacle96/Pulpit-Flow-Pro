import { useState } from 'react';
import { useStore } from '../store/store.js';
import { 
  Monitor, 
  ExternalLink, 
  RefreshCw,
  Tv,
  Radio,
  Eye,
  Lock,
  Unlock,
  RectangleHorizontal
} from 'lucide-react';

const OUTPUT_BASE = (() => {
  try {
    const port = (typeof window !== 'undefined' && window.electron?.serverPort) 
      ? Number(window.electron.serverPort) 
      : 3000;
    return `http://localhost:${Number.isFinite(port) ? port : 3000}`;
  } catch {
    return 'http://localhost:3000';
  }
})();

const outputs = [
  { 
    key: 'display', 
    label: 'Congregation', 
    path: '/display',
    icon: Monitor,
    description: 'Main auditorium display'
  },
  { 
    key: 'stream', 
    label: 'Stream', 
    path: '/stream',
    icon: Radio,
    description: 'Live stream overlay'
  },
  { 
    key: 'stage', 
    label: 'Stage', 
    path: '/stage',
    icon: Tv,
    description: 'Stage monitor'
  },
  { 
    key: 'preacher', 
    label: 'Preacher', 
    path: '/preacher',
    icon: Eye,
    description: 'Preacher notes'
  }
];

export default function RightPanel() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { outputFreeze, setOutputFreeze, streamMode, setStreamMode } = useStore();

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleOpenExternal = async (output) => {
    const path = typeof output === 'string' ? output : output.path;
    const key = typeof output === 'string' ? path : output.key;

    if (window.electron?.openOutputWindow) {
      const result = await window.electron.openOutputWindow(path);
      if (result?.ok) return;
    }

    const url = `${OUTPUT_BASE}${path}`;
    const opened = window.open(url, `pfp-output-${key}`, 'noopener,noreferrer');
    if (!opened) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="panel right-panel">
      <div className="panel-header">
        <div className="panel-title">
          <Monitor size={16} className="panel-title-icon" />
          Output Previews
        </div>
        <div className="panel-actions">
          <button 
            className="icon-btn"
            onClick={handleRefresh}
            title="Refresh Previews"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <div className="panel-body">
        <div className="output-grid">
          {outputs.map((output) => {
            const Icon = output.icon;
            const url = `${OUTPUT_BASE}${output.path}?preview=1&refresh=${refreshKey}`;
            const frozen = !!outputFreeze?.[output.key];
            
            return (
              <div key={output.key} className="output-card">
                <div className="output-header">
                  <div className="output-title">
                    <Icon size={14} className="output-title-icon" />
                    <span>{output.label}</span>
                  </div>
                  <div className="output-actions">
                    {output.key === 'stream' && (
                      <button
                        type="button"
                        className="output-open-btn"
                        onClick={() => setStreamMode(streamMode === 'full' ? 'lower' : 'full')}
                        title={streamMode === 'full' ? 'Switch to lower-third mode' : 'Switch to full-screen mode'}
                      >
                        <RectangleHorizontal size={12} aria-hidden />
                        <span className="output-open-label">{streamMode === 'full' ? 'Lower' : 'Full'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      className="output-open-btn"
                      onClick={() => setOutputFreeze(output.key, !frozen)}
                      title={frozen ? `Unfreeze ${output.label}` : `Freeze ${output.label}`}
                    >
                      {frozen ? <Unlock size={12} aria-hidden /> : <Lock size={12} aria-hidden />}
                      <span className="output-open-label">{frozen ? 'Unfreeze' : 'Freeze'}</span>
                    </button>
                    <button
                      type="button"
                      className="output-open-btn"
                      onClick={() => handleOpenExternal(output)}
                      title={`Open ${output.label} in new window`}
                    >
                      <ExternalLink size={12} aria-hidden />
                      <span className="output-open-label">Open</span>
                    </button>
                  </div>
                </div>
                
                <div className="output-preview">
                  <iframe 
                    key={refreshKey}
                    title={output.label}
                    src={url}
                    sandbox="allow-same-origin allow-scripts allow-popups"
                    loading="lazy"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
