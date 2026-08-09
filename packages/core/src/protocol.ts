/**
 * Wire protocol (JSON over WebSocket), shared by server and client.
 *
 * The engine intents are internal; over the wire, the client never names
 * itself — the server stamps the acting playerId from the socket connection.
 */

import type { Choice, Event } from './types.js';
import type { ViewState } from './view.js';

/** Client → server. */
export type ClientPacket =
  | { type: 'createRoom'; name: string; capacity: number }
  | { type: 'joinRoom'; roomCode: string; name: string }
  | { type: 'playCard'; which: 0 | 1 }
  | { type: 'choice'; choice: Choice }
  | { type: 'nextRound' }
  | { type: 'rematch' };

/**
 * Server → client. On join the server sends `hello` then a `snapshot` (the
 * current view, including the joiner's private hand), then streams `event`s.
 * `error` rejects an illegal request.
 */
export type ServerPacket =
  | { type: 'hello'; playerId: string; roomCode: string }
  | { type: 'snapshot'; view: ViewState }
  | { type: 'event'; event: Event }
  | { type: 'error'; message: string };
