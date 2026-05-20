import { useStore } from '../store/store.js';
import { 
  SkipBack, 
  SkipForward, 
  AlertCircle, 
  Power, 
  XCircle,
  ChevronLeft,
  ChevronRight,
  Square,
  MonitorPlay
} from 'lucide-react';

const API_BASE = (typeof window !== 'undefined' && window.electron?.apiBase)
  ? window.electron.apiBase
  : 'http://localhost:3000';

export default function BottomBar() {
  const { goLive, setGoLive, runRelative } = useStore();

  const handleBlankAll = async () => {
    try {
      await fetch(`${API_BASE}/api/blank`, { method: 'POST' });
    } catch (error) {
      if (import.meta.env.DEV) console.error('Blank error:', error);
    }
  };

  const handleGoLive = async () => {
    try {
      await fetch(`${API_BASE}/api/go-live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ live: !goLive })
      });
      setGoLive(!goLive);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Go Live error:', error);
    }
  };

  const handleClear = async () => {
    try {
      await fetch(`${API_BASE}/api/clear`, { method: 'POST' });
    } catch (error) {
      if (import.meta.env.DEV) console.error('Clear error:', error);
    }
  };

  return (
    <footer className="bottom-bar">
      {/* Left: Navigation Controls */}
      <div className="transport-controls">
        <button 
          onClick={() => runRelative(-1)}
          className="transport-btn"
          title="Previous (Left Arrow)"
        >
          <ChevronLeft size={20} />
        </button>

        <button 
          onClick={() => runRelative(1)}
          className="transport-btn primary"
          title="Next (Right Arrow / Space)"
        >
          <ChevronRight size={20} />
        </button>

        <div className="transport-divider" />

        <button 
          onClick={handleBlankAll}
          className="transport-btn danger"
          title="Blank All (B)"
        >
          <Square size={18} />
        </button>

        <button 
          onClick={handleClear}
          className="transport-btn"
          title="Clear (Esc)"
        >
          <XCircle size={18} />
        </button>
      </div>

      {/* Center: Live Status */}
      <button
        onClick={handleGoLive}
        className={`go-live-btn ${goLive ? 'on-air' : ''}`}
        title="Toggle Go Live (L)"
        type="button"
      >
        <MonitorPlay size={18} />
        <span>{goLive ? 'ON AIR' : 'GO LIVE'}</span>
      </button>

      {/* Right: Keyboard Shortcuts */}
      <div className="transport-shortcuts">
        <span>
          <kbd className="shortcut-key">←</kbd>
          <kbd className="shortcut-key">→</kbd>
          Navigate
        </span>
        <span>
          <kbd className="shortcut-key">B</kbd>
          Blank
        </span>
        <span>
          <kbd className="shortcut-key">L</kbd>
          Live
        </span>
      </div>
    </footer>
  );
}
