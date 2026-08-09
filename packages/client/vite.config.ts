import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // LAN play (DESIGN Q5): listen on all interfaces so a phone or friend's
    // machine on the same network can open http://<this-mac-ip>:5173.
    host: true,
    // In dev the client talks same-origin; /ws is forwarded to the Node server.
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
  },
});
