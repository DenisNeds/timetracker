import http from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { migrate } from './migrate.js';
import { seedAdmin } from './seed.js';
import authRoutes from './routes/auth.js';
import statsRoutes from './routes/stats.js';
import { closeStaleVisits } from './tracking/visits.js';
import { attachWebSocket } from './ws.js';

const PORT = process.env.PORT || 3000;

const app = express();

// Parse JSON request bodies (req.body) for POST requests
app.use(express.json());
// Parse cookies into req.cookies (we keep the login token in a cookie)
app.use(cookieParser());

// Simple endpoint to check that the server is alive
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);

// Error middleware: Express calls this when a handler throws or calls next(err).
// It must have 4 parameters, that's how Express recognises it.
app.use((err, req, res, next) => {
  // Errors with a 4xx status are the client's fault (e.g. invalid JSON body)
  if (err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

// We create the HTTP server ourselves (instead of app.listen) because
// the WebSocket server will later attach to this same server.
const server = http.createServer(app);
attachWebSocket(server);

async function start() {
  // Make sure the database tables and the admin account exist before accepting requests
  await migrate();
  await seedAdmin();
  await closeStaleVisits();

  server.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
