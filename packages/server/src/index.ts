/**
 * @love-letter/server — entry point (placeholder for ticket 01).
 *
 * A minimal Node http server that boots and listens. Ticket 02 adds the WS
 * upgrade + static client serving; ticket 05 adds rooms, reconnect, chat.
 */

import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 3001);

const server = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Love Letter server is running\n');
});

server.listen(PORT, () => {
  console.log(`Love Letter server listening on http://localhost:${PORT}`);
});
