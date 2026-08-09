/**
 * @love-letter/server — entry point.
 *
 * Boots the http + ws server. In dev the client runs on Vite (port 5173) and
 * proxies /ws here; in a single-process deploy this server also serves the
 * built client from packages/client/dist.
 */

import { resolve } from 'node:path';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT ?? 3001);
const STATIC_ROOT = process.env.STATIC_ROOT ?? resolve(import.meta.dirname, '../../client/dist');

const app = await createApp({ port: PORT, staticRoot: STATIC_ROOT });
console.log(`Love Letter server listening on http://localhost:${app.port} (ws at /ws)`);
