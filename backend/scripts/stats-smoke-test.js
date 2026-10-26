// Manual live-stats test: opens the stats page and prints the pushed stats.
// Run inside the backend container:
//   docker compose exec backend node scripts/stats-smoke-test.js <username> <password>
import WebSocket from 'ws';

const [username = 'denis', password = 'secret123'] = process.argv.slice(2);
const BASE = 'localhost:3000';
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
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});
console.log(`connected as ${username}, entering the stats page`);
ws.send(JSON.stringify({ type: 'enter', page: 'stats' }));

// Print a short summary of the first 4 stats messages, then stop
let received = 0;
ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type !== 'stats') return console.log(time(), 'server →', data.toString());

  console.log(time(), `stats (scope: ${msg.scope})`);
  for (const user of msg.users) {
    const pages = Object.entries(user.pages)
      .map(([page, p]) => `${page}=${p.seconds.toFixed(1)}s${p.active ? '*' : ''}`)
      .join('  ');
    console.log(`   ${user.username.padEnd(12)} ${pages}   total=${user.totalSeconds.toFixed(1)}s`);
  }
  if (++received === 4) {
    ws.close();
    console.log('closed (* = on that page right now)');
  }
});
