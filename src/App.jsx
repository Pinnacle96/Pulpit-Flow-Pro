import { useState, useEffect, useRef } from 'react';
import { useStore } from './store/store.js';
import TopBar from './panels/TopBar';
import LeftPanel from './panels/LeftPanel';
import CenterPanel from './panels/CenterPanel';
import RightPanel from './panels/RightPanel';
import BottomBar from './panels/BottomBar';
import './App.css';

const API_BASE = (typeof window !== 'undefined' && window.electron?.apiBase)
  ? window.electron.apiBase
  : 'http://localhost:3000';
const WS_BASE = (() => {
  try {
    const port = (typeof window !== 'undefined' && window.electron?.serverPort) ? Number(window.electron.serverPort) : 3000;
    const p = Number.isFinite(port) ? port : 3000;
    return `ws://localhost:${p}`;
  } catch {
    return 'ws://localhost:3000';
  }
})();

export default function App() {
  const { goLive, setGoLive, runRelative, setCenterTab, runSongSectionRelative, activateNearestBlockOfType } = useStore();
  const [serverStatus, setServerStatus] = useState(false);
  const centerPanelRef = useRef(null);
  const wsRef = useRef(null);
  const wsRetryRef = useRef(0);

  useEffect(() => {
    // Check server health
    const checkServer = async () => {
      try {
        const response = await fetch(`${API_BASE}/health`);
        setServerStatus(response.ok);
      } catch {
        setServerStatus(false);
      }
    };

    checkServer();
    const interval = setInterval(checkServer, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      try {
        wsRef.current?.close?.();
      } catch {}
      const ws = new WebSocket(WS_BASE);
      wsRef.current = ws;

      ws.onopen = () => {
        wsRetryRef.current = 0;
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg?.type === 'GO_LIVE') {
            setGoLive(!!msg.payload?.live);
          }
          if (msg?.type === 'OUTPUT_FREEZE') {
            const p = msg.payload;
            if (p && typeof p === 'object') {
              if (typeof p.target === 'string') {
                const target = p.target;
                const frozen = !!p.frozen;
                if (target === 'display' || target === 'stream' || target === 'stage' || target === 'preacher') {
                  useStore.setState((s) => ({
                    outputFreeze: { ...(s.outputFreeze || {}), [target]: frozen }
                  }));
                }
              } else {
                const next = {
                  display: !!p.display,
                  stream: !!p.stream,
                  stage: !!p.stage,
                  preacher: !!p.preacher
                };
                useStore.setState({ outputFreeze: next });
              }
            }
          }
          if (msg?.type === 'STREAM_MODE') {
            const mode = String(msg.payload?.mode || '').trim().toLowerCase() === 'full' ? 'full' : 'lower';
            useStore.setState({ streamMode: mode });
          }
          if (msg?.type === 'REMOTE_NAV') {
            const delta = Number(msg.payload?.delta);
            if (delta > 0) runRelative(1);
            if (delta < 0) runRelative(-1);
          }
          if (msg?.type === 'REMOTE_ACTION') {
            const action = String(msg.payload?.action || '').trim().toUpperCase();
            if (action === 'WORSHIP_NEXT') runSongSectionRelative(1);
            if (action === 'WORSHIP_PREV') runSongSectionRelative(-1);
            if (action === 'PASTOR_NEXT_SCRIPTURE') activateNearestBlockOfType('scripture', 1);
            if (action === 'PASTOR_PREV_SCRIPTURE') activateNearestBlockOfType('scripture', -1);
          }
        } catch {}
      };

      ws.onclose = () => {
        if (stopped) return;
        const attempt = Math.min(5, (wsRetryRef.current || 0) + 1);
        wsRetryRef.current = attempt;
        const delay = Math.min(8000, 1000 * Math.pow(2, attempt));
        setTimeout(connect, delay);
      };

      ws.onerror = () => {};
    };

    connect();
    return () => {
      stopped = true;
      try {
        wsRef.current?.close?.();
      } catch {}
      wsRef.current = null;
    };
  }, [runRelative, runSongSectionRelative, activateNearestBlockOfType]);

  useEffect(() => {
    const loadState = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/state`);
        if (!response.ok) return;
        const data = await response.json();
        if (typeof data.goLive === 'boolean') setGoLive(data.goLive);
        if (data.freeze && typeof data.freeze === 'object') {
          useStore.setState({
            outputFreeze: {
              display: !!data.freeze.display,
              stream: !!data.freeze.stream,
              stage: !!data.freeze.stage,
              preacher: !!data.freeze.preacher
            }
          });
        }
        if (typeof data.streamMode === 'string') {
          const mode = data.streamMode.trim().toLowerCase() === 'full' ? 'full' : 'lower';
          useStore.setState({ streamMode: mode });
        }
      } catch {}
    };
    loadState();
  }, [setGoLive]);

  // Keyboard shortcuts
  useEffect(() => {
    const isEditableElement = (el) => {
      const node = el || document.activeElement;
      if (!node) return false;
      if (node.isContentEditable) return true;
      if (node.closest?.('.modal')) return true;
      const tag = String(node.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag !== 'INPUT') return false;
      const type = String(node.getAttribute?.('type') || node.type || 'text').toLowerCase();
      return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
    };

    const handleKeyDown = (e) => {
      const target = e.target || document.activeElement;
      const editable = isEditableElement(target);

      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        if (editable) return;
        e.preventDefault();
        window.dispatchEvent(new Event('pfp-save-plan'));
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setCenterTab('bible');
        window.dispatchEvent(new Event('pfp-focus-bible'));
        centerPanelRef.current?.focusBibleSearch?.();
        return;
      }

      // Never hijack navigation/typing keys while user is in a text field (settings, editors, search, etc.)
      if (editable) return;

      switch (e.key) {
        case ' ':
        case 'ArrowRight':
          e.preventDefault();
          runRelative(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          runRelative(-1);
          break;
        case 'Escape':
          e.preventDefault();
          handleClear();
          break;
        case 'b':
        case 'B':
          e.preventDefault();
          handleBlankAll();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          handleGoLive();
          break;
        case 'F11':
          e.preventDefault();
          toggleFullscreen();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goLive, runRelative, setCenterTab]);

  useEffect(() => {
    const onBibleNext = () => {
      runRelative(1);
    };
    const onBiblePrev = () => {
      runRelative(-1);
    };
    window.addEventListener('pfp-bible-next', onBibleNext);
    window.addEventListener('pfp-bible-prev', onBiblePrev);
    return () => {
      window.removeEventListener('pfp-bible-next', onBibleNext);
      window.removeEventListener('pfp-bible-prev', onBiblePrev);
    };
  }, [runRelative]);

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

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {}
  };

  return (
    <div className="app-container">
      <TopBar serverStatus={serverStatus} />
      
      <div className="main-content">
        <LeftPanel />
        <CenterPanel ref={centerPanelRef} />
        <RightPanel />
      </div>

      <BottomBar />
    </div>
  );
}
