// Manual WebSocket test, simulating what the browser will do.
// Run inside the backend container:
//   docker compose exec backend node scripts/ws-smoke-test.js <username> <password>
import WebSocket from 'ws';

const [username = 'denis', password = 'secret123'] = process.argv.slice(2);
const BASE = 'localhost:3000';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. Without a login cookie the server must refuse the connection
await new Promise((resolve) => {
  const anon = new WebSocket(`ws://${BASE}/ws`);
  anon.on('unexpected-response', (req, res) => {
    console.log('without cookie → HTTP', res.statusCode);
    req.destroy();
    resolve();
  });
  anon.on('open', () => {
    console.log('ERROR: connected without a cookie');
    anon.close();
    resolve();
  });
  anon.on('error', () => {});
});

// 2. Log in over HTTP to get the cookie
const res = await fetch(`http://${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
});
if (!res.ok) {
  console.error('Login failed:', res.status, await res.text());
  process.exit(1);
}
const cookie = res.headers.get('set-cookie').split(';')[0];

// 3. Connect with the cookie and move between pages
const ws = new WebSocket(`ws://${BASE}/ws`, { headers: { Cookie: cookie } });
ws.on('message', (data) => console.log('server →', data.toString()));
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});
console.log('connected as', username);

const send = (msg) => {
  console.log('client →', JSON.stringify(msg));
  ws.send(JSON.stringify(msg));
};

send({ type: 'enter', page: 'home' });
await wait(3000);
send({ type: 'enter', page: 'articles' });
await wait(2000);
send({ type: 'pause' });
await wait(1000);
send({ type: 'enter', page: 'nope' }); // should get an error back
await wait(500);

ws.close();
console.log('closed');
