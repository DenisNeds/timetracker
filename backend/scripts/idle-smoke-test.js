// Manual idle-detection test. Start the backend with a short timeout first:
//   IDLE_TIMEOUT_SECONDS=15 docker compose up -d backend
// then run inside the backend container:
//   docker compose exec backend node scripts/idle-smoke-test.js <username> <password>
import WebSocket from 'ws';

const [username = 'denis', password = 'secret123'] = process.argv.slice(2);
const BASE = 'localhost:3000';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const time = () => new Date().toISOString().slice(11, 19);

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

const ws = new WebSocket(`ws://${BASE}/ws`, { headers: { Cookie: cookie } });
const messages = [];
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  messages.push(msg.type);
  console.log(time(), 'server →', data.toString());
});
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});

const send = (msg) => {
  console.log(time(), 'client →', JSON.stringify(msg));
  ws.send(JSON.stringify(msg));
};

send({ type: 'enter', page: 'home' });
await wait(3000);
send({ type: 'activity' }); // last activity: the visit should end here
console.log(time(), 'now doing nothing, waiting for the server to say "idle"...');

for (let i = 0; i < 60 && !messages.includes('idle'); i++) {
  await wait(1000);
}
if (!messages.includes('idle')) {
  console.log('ERROR: no "idle" after 60 s. Is IDLE_TIMEOUT_SECONDS short enough?');
}

send({ type: 'activity' }); // user is back: a new visit should start
await wait(2000);
ws.close();
console.log(time(), 'closed');
