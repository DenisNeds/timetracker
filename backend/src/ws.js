import { WebSocketServer } from 'ws';
import { verifyToken, TOKEN_COOKIE } from './middleware/auth.js';
import { PAGES, startVisit, touchVisit, endVisit } from './tracking/visits.js';

// Every 10 s the server pings each browser. A browser that hasn't answered
// the previous ping by the next round is treated as gone (closed laptop,
// lost Wi-Fi...), so a dead connection is detected within 10-20 s.
const HEARTBEAT_INTERVAL_MS = 10_000;

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

async function handleMessage(ws, msg) {
  switch (msg.type) {
    // { type: 'enter', page: 'home' } — the user is now looking at this page
    case 'enter': {
      if (!PAGES.includes(msg.page)) {
        return send(ws, { type: 'error', error: `Unknown page: ${msg.page}` });
      }
      ws.visitId = await startVisit(ws.user.id, msg.page);
      ws.page = msg.page;

      // startVisit closed the visit of any other tab of this user. Tell those
      // tabs, so they can show "tracking continues in another tab".
      for (const other of wss.clients) {
        if (other !== ws && other.user.id === ws.user.id && other.visitId) {
          other.visitId = null;
          send(other, { type: 'inactive' });
        }
      }
      break;
    }

    // { type: 'pause' } — the tab was hidden; stop counting until the next 'enter'
    case 'pause':
      if (ws.visitId) {
        await endVisit(ws.visitId, 'now');
        ws.visitId = null;
      }
      break;

    default:
      send(ws, { type: 'error', error: `Unknown message type: ${msg.type}` });
  }
}

// The browser answered our ping: it's still there, so move last_seen_at forward
async function onHeartbeat(ws) {
  if (ws.visitId && !(await touchVisit(ws.visitId))) {
    // The visit was closed elsewhere (another tab took over, or logout)
    ws.visitId = null;
    send(ws, { type: 'inactive' });
  }
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
    ws.isAlive = true;
    ws.timedOut = false;

    // Handle this socket's events one at a time, in order. Each step waits for
    // the previous one's database work, so e.g. a quick 'enter' + 'pause'
    // can't run in the wrong order.
    ws.queue = Promise.resolve();
    const enqueue = (task) => {
      ws.queue = ws.queue.then(task).catch((err) => console.error('WebSocket task failed:', err));
    };

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return send(ws, { type: 'error', error: 'Invalid JSON' });
      }
      enqueue(() => handleMessage(ws, msg));
    });

    ws.on('pong', () => {
      ws.isAlive = true;
      enqueue(() => onHeartbeat(ws));
    });

    // Tab closed, logout, or heartbeat timeout: stop the clock.
    ws.on('close', () => {
      enqueue(async () => {
        if (ws.visitId) {
          // Clean close: the user left just now. Timeout: we only know they
          // were there until the last heartbeat, so don't count the silent gap.
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
