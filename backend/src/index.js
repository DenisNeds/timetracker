import http from 'node:http';
import express from 'express';

const PORT = process.env.PORT || 3000;

const app = express();

// Parse JSON request bodies (req.body) for POST requests
app.use(express.json());

// Simple endpoint to check that the server is alive
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// We create the HTTP server ourselves (instead of app.listen) because
// the WebSocket server will later attach to this same server.
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
