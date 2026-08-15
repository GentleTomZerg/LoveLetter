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

/** One row of the room directory (ADR-0008): an open room — a room in its
 *  lobby phase with at least one free seat. In-progress rooms never appear
 *  (mid-match join is engine-illegal). The host is the first player seated,
 *  display-only — the room is hostless (no powers). */
export interface RoomSummary {
  code: string;
  /** The first player seated — display-only, no powers. */
  host: string;
  /** Seated players' names, in seat order. */
  names: string[];
  seated: number;
  capacity: number;
}

/** Client → server. */
export type ClientPacket =
  | { type: 'createRoom'; name: string; capacity: number }
  | { type: 'joinRoom'; roomCode: string; name: string }
  | { type: 'playCard'; which: 0 | 1 }
  | { type: 'choice'; choice: Choice }
  | { type: 'nextRound' }
  | { type: 'rematch' }
  /** Leave for good (issue 11): the seat is freed immediately and the stored
   *  identity is cleared client-side, so a refresh never resumes. Unlike a
   *  socket drop, no grace window starts. */
  | { type: 'leave' }
  /** Reconnect to the seat the server issued `playerId` for; the server
   *  replays every event after `lastEventId` (the id of the last event the
   *  client applied, −1 if none). The client never names itself on a fresh
   *  create/join — only on resume. */
  | { type: 'resume'; playerId: string; lastEventId: number }
  | { type: 'chat'; text: string }
  /** Ask for the room directory (ticket 40) — answered with a `roomList`
   *  snapshot; the server also pushes fresh snapshots to browsing sockets. */
  | { type: 'roomList' };

/**
 * Server → client. On join the server sends `hello` then a `snapshot` (the
 * current view, including the joiner's private hand), then streams `event`s.
 * Each event carries its id (its index in the room's authoritative log) so a
 * resuming client can replay from `lastEventId`. `snapshot.lastEventId` is
 * the log id the snapshot covers; events with a higher id fold on top of it.
 * `snapshot.away` lists the seats whose sockets are currently dropped (in
 * their grace window) — room-layer state, like chat, so it travels on the
 * packet rather than the event log. `playerGone`/`playerBack` update that
 * set live; `roomClosed` is the terminal teardown notice (e.g. the other
 * player left a 2-player match).
 * `error` rejects an illegal request.
 */
export type ServerPacket =
  | { type: 'hello'; playerId: string; roomCode: string }
  | { type: 'snapshot'; view: ViewState; lastEventId: number; away: string[] }
  | { type: 'event'; id: number; event: Event }
  | { type: 'chat'; message: ChatMessage }
  /** Recent chat history, sent on resume so a reconnecting player keeps it. */
  | { type: 'chatLog'; messages: ChatMessage[] }
  /** The room directory (ticket 40): open rooms, newest first. Sent on
   *  request and pushed to browsing sockets whenever it changes. */
  | { type: 'roomList'; rooms: RoomSummary[] }
  | { type: 'playerGone'; playerId: string; name: string }
  | { type: 'playerBack'; playerId: string; name: string }
  /** Terminal teardown notice — a code plus params, translated client-side (ADR-0005). */
  | { type: 'roomClosed'; code: string; params?: WireParams }
  /** An illegal request rejected — a code plus params, translated client-side (ADR-0005). */
  | { type: 'error'; code: string; params?: WireParams };

/** Params that travel with an error/roomClosed code (ADR-0005). */
export type WireParams = Record<string, string | number>;
