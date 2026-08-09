/**
 * Wire protocol (JSON over WebSocket), shared by server and client.
 *
 * The engine intents are internal; over the wire, the client never names
 * itself — the server stamps the acting playerId from the socket connection.
 */

import type { Choice, Event } from './types.js';
import type { ViewState } from './view.js';

/** One line of room chat (relayed by the server, not part of the event log). */
export interface ChatMessage {
  from: string;
  name: string;
  text: string;
}

/** Client → server. */
export type ClientPacket =
  | { type: 'createRoom'; name: string; capacity: number }
  | { type: 'joinRoom'; roomCode: string; name: string }
  | { type: 'playCard'; which: 0 | 1 }
  | { type: 'choice'; choice: Choice }
  | { type: 'nextRound' }
  | { type: 'rematch' }
  /** Reconnect to the seat the server issued `playerId` for; the server
   *  replays every event after `lastEventId` (the id of the last event the
   *  client applied, −1 if none). The client never names itself on a fresh
   *  create/join — only on resume. */
  | { type: 'resume'; playerId: string; lastEventId: number }
  | { type: 'chat'; text: string };

/**
 * Server → client. On join the server sends `hello` then a `snapshot` (the
 * current view, including the joiner's private hand), then streams `event`s.
 * Each event carries its id (its index in the room's authoritative log) so a
 * resuming client can replay from `lastEventId`. `snapshot.lastEventId` is
 * the log id the snapshot covers; events with a higher id fold on top of it.
 * `error` rejects an illegal request.
 */
export type ServerPacket =
  | { type: 'hello'; playerId: string; roomCode: string }
  | { type: 'snapshot'; view: ViewState; lastEventId: number }
  | { type: 'event'; id: number; event: Event }
  | { type: 'chat'; message: ChatMessage }
  /** Recent chat history, sent on resume so a reconnecting player keeps it. */
  | { type: 'chatLog'; messages: ChatMessage[] }
  | { type: 'error'; message: string };
