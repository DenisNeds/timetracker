import { WebSocketServer } from 'ws';
import { verifyToken, TOKEN_COOKIE } from './middleware/auth.js';
import { PAGES, startVisit, touchVisit, endVisit } from './tracking/visits.js';

// Every 10 s the server pings each browser. A browser that hasn't answered
// the previous ping by the next round is treated as gone (closed laptop,
// lost Wi-Fi...), so a dead connection is detected within 10-20 s.
const HEARTBEAT_INTERVAL_MS = 10_000;

// No mouse/keyboard/scroll/touch activity for this long = the user is away,
// so we stop counting. Checked on every heartbeat round. Reading an article or
// watching the live stats can mean minutes without any input, so those pages
// get a longer window than the short home page.
const IDLE_TIMEOUTS_MS = {
  home: 2 * 60_000,
  articles: 5 * 60_000,
  stats: 5 * 60_000,
};
// IDLE_TIMEOUT_SECONDS (optional) overrides all pages, e.g. a short value for testing
const IDLE_TIMEOUT_OVERRIDE_MS = Number(process.env.IDLE_TIMEOUT_SECONDS) * 1000 || null;

function idleTimeoutFor(page) {
  return IDLE_TIMEOUT_OVERRIDE_MS ?? IDLE_TIMEOUTS_MS[page];
}

let wss;

// Read one cookie from the raw "Cookie: a=1; b=2" header.
// (cookie-parser only works on Express requests, and an upgrade isn't one.)
function getCookie(req, name) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Handle this socket's events one at a time, in order. Each task waits for
// the previous one's database work, so e.g. a quick 'enter' + 'pause'
// can't run in the wrong order.
function enqueue(ws, task) {
  ws.queue = ws.queue.then(task).catch((err) => console.error('WebSocket task failed:', err));
}

// Opens a visit for this tab and tells other tabs of the same user that
// they lost theirs (startVisit closed it, a user is on one page at a time).
async function startTracking(ws, page) {
  ws.visitId = await startVisit(ws.user.id, page);
  ws.page = page;
  ws.paused = false;
  ws.lastActivityAt = Date.now();

  for (const other of wss.clients) {
    if (other !== ws && other.user.id === ws.user.id && other.visitId) {
      other.visitId = null;
      send(other, { type: 'inactive' });
    }
  }
}

async function handleMessage(ws, msg) {
  switch (msg.type) {
    // { type: 'enter', page: 'home' } — the user is now looking at this page
    case 'enter':
      if (!PAGES.includes(msg.page)) {
        return send(ws, { type: 'error', error: `Unknown page: ${msg.page}` });
      }
      await startTracking(ws, msg.page);
      break;

    // { type: 'activity' } — the user moved the mouse, typed, scrolled...
    // The browser sends this at most every few seconds while the user is active.
    case 'activity':
      if (ws.paused || !ws.page) return; // hidden tab, or no page entered yet
      ws.lastActivityAt = Date.now();
      if (ws.visitId && await touchVisit(ws.visitId)) return;
      // No open visit: the user is back after being idle, or is now using
      // this tab instead of another one. Start counting again.
      await startTracking(ws, ws.page);
      send(ws, { type: 'active' });
      break;

    // { type: 'pause' } — the tab was hidden; stop counting until the next 'enter'
    case 'pause':
      ws.paused = true;
      if (ws.visitId) {
        await endVisit(ws.visitId, 'now');
        ws.visitId = null;
      }
      break;

    default:
      send(ws, { type: 'error', error: `Unknown message type: ${msg.type}` });
  }
}

// No activity for the page's idle timeout: end the visit at the last activity
// (last_seen_at), so the idle minutes are not counted.
async function endIdleVisit(ws) {
  if (!ws.visitId || Date.now() - ws.lastActivityAt < idleTimeoutFor(ws.page)) return;
  await endVisit(ws.visitId, 'lastSeen');
  ws.visitId = null;
  send(ws, { type: 'idle' });
}

export function attachWebSocket(server) {
  // noServer: we handle the HTTP "upgrade" ourselves so we can check the login first
  wss = new WebSocketServer({ noServer: true });

  // A WebSocket starts as a normal HTTP request asking to "upgrade" the connection.
  // This is the only moment we can reject it, so authentication happens here.
  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/ws') {
      socket.destroy();
      return;
    }
    let user;
    try {
      user = verifyToken(getCookie(req, TOKEN_COOKIE));
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, user));
  });

  wss.on('connection', (ws, user) => {
    ws.user = user;
    ws.visitId = null; // id of this tab's open page_visits row, if any
    ws.page = null; // last page this tab entered
    ws.paused = false; // tab hidden
    ws.lastActivityAt = Date.now();
    ws.isAlive = true;
    ws.timedOut = false;
    ws.queue = Promise.resolve();

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return send(ws, { type: 'error', error: 'Invalid JSON' });
      }
      enqueue(ws, () => handleMessage(ws, msg));
    });

    // A pong only proves the connection is alive, not that the user is
    // there, so it doesn't move last_seen_at (only 'activity' does).
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Tab closed, logout, or heartbeat timeout: stop the clock.
    ws.on('close', () => {
      enqueue(ws, async () => {
        if (ws.visitId) {
          // Clean close: the user left just now. Timeout: we only know they
          // were active until last_seen_at, so don't count the silent gap.
          await endVisit(ws.visitId, ws.timedOut ? 'lastSeen' : 'now');
          ws.visitId = null;
        }
      });
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.timedOut = true;
        ws.terminate(); // fires the 'close' handler above
        continue;
      }
      ws.isAlive = false;
      ws.ping(); // browsers answer pings automatically, no frontend code needed
      enqueue(ws, () => endIdleVisit(ws));
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));
}

// Called on logout: disconnect all of this user's open tabs
export function closeUserConnections(userId) {
  if (!wss) return;
  for (const ws of wss.clients) {
    if (ws.user.id === userId) {
      ws.close(4001, 'Logged out');
    }
  }
}
