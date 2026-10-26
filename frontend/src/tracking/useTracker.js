import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { api } from '../api.js';

// Which tracked page each route is
const PAGE_BY_PATH = { '/': 'home', '/articles': 'articles', '/stats': 'stats' };

// Events that mean "the user is here". Sending one 'activity' message per
// 5 s is plenty: the server's idle timeouts are minutes long.
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'scroll', 'touchstart'];
const ACTIVITY_THROTTLE_MS = 5000;

const RECONNECT_DELAY_MS = 3000;

// Is the user looking at the app right now? The tab must be visible (not
// another tab, not minimized) AND the window focused: a visible window
// behind another app (e.g. a terminal) still counts as "not looking".
function isWatching() {
  return !document.hidden && document.hasFocus();
}

// Sends a message if the socket is open. Returns whether it was sent.
function sendTo(ws, message) {
  if (ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify(message));
  return true;
}

// Keeps one WebSocket open while the user is logged in and tells the server
// what the user is doing: which page is open, whether the tab is visible and
// whether the user is active. The server does all the time counting.
//
// status: 'connecting' | 'tracking' | 'idle' | 'inactive' | 'paused' | 'offline'
// stats:  the latest live stats message (only sent while on the stats page)
export function useTracker(onLoggedOut) {
  const { pathname } = useLocation();
  const page = PAGE_BY_PATH[pathname];

  const [status, setStatus] = useState('connecting');
  const [stats, setStats] = useState(null);

  // Refs instead of state for values the event handlers below need to read:
  // the handlers are created once, and refs always hold the current value.
  const wsRef = useRef(null);
  const pageRef = useRef(page);
  const watchingRef = useRef(isWatching());
  const lastActivitySentRef = useRef(0);
  const onLoggedOutRef = useRef(onLoggedOut);
  onLoggedOutRef.current = onLoggedOut;

  // The connection: open it, react to server messages, reconnect if it drops
  useEffect(() => {
    let disposed = false;
    let retryTimer;

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        // A hidden or unfocused tab doesn't enter a page; it will when the user comes back
        if (!watchingRef.current) {
          setStatus('paused');
        } else if (sendTo(ws, { type: 'enter', page: pageRef.current })) {
          setStatus('tracking');
        }
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'stats':
            setStats(msg);
            break;
          // The server stopped counting: no activity for too long...
          case 'idle':
            lastActivitySentRef.current = 0; // so the next activity is sent right away
            setStatus('idle');
            break;
          // ...or the user is now using another tab
          case 'inactive':
            lastActivitySentRef.current = 0;
            setStatus('inactive');
            break;
          // Activity in this tab started counting again
          case 'active':
            setStatus('tracking');
            break;
          case 'error':
            console.warn('Tracker:', msg.error);
            break;
          default:
        }
      };

      ws.onclose = (event) => {
        if (disposed) return; // we closed it ourselves (logout or unmount)
        wsRef.current = null;
        // 4001: the server closed every tab of this user because they logged out
        if (event.code === 4001) {
          onLoggedOutRef.current();
          return;
        }
        // Server restart or lost network: try again in a moment. If the login
        // expired in the meantime, the upgrade would fail forever, so check first.
        setStatus('offline');
        retryTimer = setTimeout(async () => {
          try {
            await api('/auth/me');
          } catch (err) {
            if (err.status === 401) {
              onLoggedOutRef.current();
              return;
            }
            // anything else (server still down): just try to connect again
          }
          if (!disposed) connect();
        }, RECONNECT_DELAY_MS);
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws?.readyState === WebSocket.CONNECTING) {
        // Closing mid-handshake makes the browser log a connection error
        // (happens in dev, where StrictMode mounts twice). Close once open instead,
        // replacing onopen so this socket never enters a page.
        ws.onopen = () => ws.close();
      } else {
        ws?.close(); // the server ends the open visit right away
      }
    };
  }, []);

  // Route changed: tell the server about the new page
  useEffect(() => {
    pageRef.current = page;
    if (page !== 'stats') setStats(null); // old numbers would be stale next time
    if (!page) return; // unknown URL, the router is redirecting to a real page
    // If the socket isn't open yet, onopen sends the page instead
    if (watchingRef.current && sendTo(wsRef.current, { type: 'enter', page })) {
      setStatus('tracking');
    }
  }, [page]);

  // User looks away (other tab, minimized, another app focused): pause.
  // User comes back: enter the current page again.
  useEffect(() => {
    function setWatching(watching) {
      // Switching to another tab fires both blur and visibilitychange;
      // only react to real changes so the server gets one message, not two.
      if (watching === watchingRef.current) return;
      watchingRef.current = watching;
      if (!watching) {
        sendTo(wsRef.current, { type: 'pause' });
        setStatus('paused');
      } else if (sendTo(wsRef.current, { type: 'enter', page: pageRef.current })) {
        setStatus('tracking');
      }
    }
    // explicit values for blur/focus: hasFocus() can still be stale inside these events
    const handleBlur = () => setWatching(false);
    const handleFocus = () => setWatching(!document.hidden);
    const handleVisibilityChange = () => setWatching(isWatching());

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Mouse, keyboard, scroll or touch: "the user is still here" (at most every 5 s)
  useEffect(() => {
    function handleActivity() {
      const now = Date.now();
      if (now - lastActivitySentRef.current < ACTIVITY_THROTTLE_MS) return;
      if (sendTo(wsRef.current, { type: 'activity' })) {
        lastActivitySentRef.current = now;
      }
    }
    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, handleActivity, { passive: true });
    }
    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, handleActivity);
      }
    };
  }, []);

  return { page, status, stats };
}
