import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite server forwards /api and /ws to the backend, so the
// browser sees one origin (localhost:5173) and the login cookie just works.
// In Docker, nginx does the same job.
// BACKEND_PORT must match the one docker compose uses (default 3000).
const backend = `localhost:${process.env.BACKEND_PORT || 3000}`;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://${backend}`,
      '/ws': { target: `ws://${backend}`, ws: true },
    },
  },
});
