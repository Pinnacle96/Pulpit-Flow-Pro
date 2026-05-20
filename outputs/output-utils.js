/**
 * Shared helpers for Pulpit Flow Pro output screens.
 */
(function () {
  function getBanner() {
    return document.getElementById('pfp-reconnect');
  }

  function setReconnect(visible, failed) {
    const el = getBanner();
    if (!el) return;
    el.classList.toggle('failed', !!failed);
    if (failed) {
      el.hidden = false;
      el.textContent = 'Connection lost — ensure Pulpit Flow Pro is running';
      return;
    }
    if (visible) {
      el.hidden = false;
      el.textContent = 'Reconnecting to server…';
    } else {
      el.hidden = true;
    }
  }

  function createConnection(handlers) {
    const host = location.host || 'localhost:3000';
    let attempt = 0;
    let ws = null;

    function connect() {
      setReconnect(attempt > 0, false);
      ws = new WebSocket(`ws://${host}`);

      ws.onopen = () => {
        attempt = 0;
        setReconnect(false);
        try {
          handlers.onopen?.(ws);
        } catch {}
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handlers.onmessage?.(message, ws);
        } catch {}
      };

      ws.onclose = () => {
        if (attempt >= 5) {
          setReconnect(true, true);
          return;
        }
        attempt += 1;
        setReconnect(true, false);
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        setTimeout(connect, delay);
      };

      ws.onerror = () => {};
    }

    connect();

    return {
      get socket() {
        return ws;
      },
      send(message) {
        if (!ws || ws.readyState !== 1) return;
        ws.send(
          JSON.stringify({
            type: message.type,
            payload: message.payload ?? {},
            timestamp: Date.now()
          })
        );
      }
    };
  }

  function pulseFade(el) {
    if (!el) return;
    el.classList.remove('pfp-fade-in');
    void el.offsetWidth;
    el.classList.add('pfp-fade-in');
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.PfpOutput = {
    setReconnect,
    createConnection,
    pulseFade,
    escapeHtml
  };
})();
