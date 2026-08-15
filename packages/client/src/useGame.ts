/**
 * Connection hook: opens the WebSocket, folds server packets into the view
 * using the core reducer, and exposes typed send helpers.
 *
 * The client is deliberately thin — the server owns all state; here we just
 * render whatever the event stream describes.
 *
 * Reconnect (ticket 05): the playerId the server issued is kept in
 * sessionStorage, so a refresh resumes the same seat instead of starting a
 * fresh create/join. On load the client sends `resume {playerId, lastEventId}`
 * and the server replies with a snapshot plus the missed events; the reducer
 * only folds events newer than the snapshot, so nothing double-applies.
 * A failed resume (room gone) clears the stored identity and lands on Home.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { reduceView } from '@love-letter/core';
import type {
  ChatMessage,
  Choice,
  ClientPacket,
  RoomSummary,
  ServerPacket,
  ViewState,
  WireParams,
} from '@love-letter/core';
import type { ActivityLine } from './i18n/logFormat';

export type ConnStatus = 'connecting' | 'open' | 'closed';

/** An error or teardown notice from the server: a code plus params, translated at render (ADR-0005). */
export interface WireError {
  code: string;
  params?: WireParams;
}

function wireError(code: string, params?: WireParams): WireError {
  return params === undefined ? { code } : { code, params };
}

export interface GameState {
  status: ConnStatus;
  selfId: string | null;
  view: ViewState | null;
  /** The latest rejected request, shown in the error banner. */
  error: WireError | null;
  /** The log id the view covers; only newer events are folded. */
  lastEventId: number;
  /** Room chat, rendered by the Game screen (ticket 06). */
  chat: ChatMessage[];
  /** Seats whose sockets are currently dropped — the away badges (issue 11). */
  away: string[];
  /** The room directory (ticket 40): open rooms, newest first. Requested on
   *  Home mount and kept live by the server's pushes while this tab browses. */
  rooms: RoomSummary[];
  /** Room-layer status lines (disconnects/reconnects), shown with the log. */
  activity: ActivityLine[];
  activitySeq: number;
  /** The socket arrival order — the shared clock that orders the game log
   *  and room activity into one "newest" (ticket 31). */
  arrivalSeq: number;
  /** Log entry id → its arrival order (ticket 31). */
  logArrivals: Record<number, number>;
  /** Set when the server tears the room down under us (issue 11). */
  roomClosed: WireError | null;
  /** True after an intentional leave; the tab is back on Home with a fresh socket. */
  left: boolean;
  /** Re-keys the socket effect so a leave/reset opens a fresh connection. */
  session: number;
}

type Action =
  | { type: 'status'; status: ConnStatus }
  | { type: 'packet'; packet: ServerPacket }
  | { type: 'clearError' }
  | { type: 'left' }
  | { type: 'reset' };

const STORAGE_KEY = 'love-letter-player-id';

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status };
    case 'clearError':
      return { ...state, error: null };
    case 'left':
      // Intentional exit: identity cleared by the caller, view dropped, and a
      // fresh socket opens (session++). Home renders while it connects — the
      // 'connecting' status is what re-triggers the directory request (ticket
      // 40) once the new socket is live.
      return { ...initial, left: true, status: 'connecting', session: state.session + 1 };
    case 'reset':
      // Back to Home (e.g. after a roomClosed): fresh state, fresh socket.
      return { ...initial, session: state.session + 1 };
    case 'packet': {
      const p = action.packet;
      switch (p.type) {
        case 'hello':
          return { ...state, selfId: p.playerId, left: false, away: [], activity: [], activitySeq: 0, error: null };
        case 'snapshot':
          // A fresh client starts from the snapshot; a resuming client that
          // kept its view folds the replayed events onto it instead.
          return state.view === null
            ? { ...state, view: p.view, lastEventId: p.lastEventId, away: p.away, error: null }
            : state;
        case 'event':
          return state.view !== null && state.selfId !== null && p.id > state.lastEventId
            ? (() => {
              const before = state.view.log.length;
              // The guard above guarantees a non-null view, so the fold cannot
              // return null here.
              const next = reduceView(state.view, p.event, state.selfId)!;
              // One event folds at most one log entry — stamp it with the
              // socket arrival order (ticket 31), so "newest" is comparable
              // with the activity lines below.
              let { arrivalSeq, logArrivals } = state;
              if (next.log.length > before) {
                const entry = next.log[next.log.length - 1]!;
                arrivalSeq += 1;
                logArrivals = { ...logArrivals, [entry.id]: arrivalSeq };
              }
              return { ...state, view: next, lastEventId: p.id, arrivalSeq, logArrivals };
            })()
            : state;
        case 'chat':
          return { ...state, chat: [...state.chat, p.message] };
        case 'chatLog':
          return { ...state, chat: [...p.messages] };
        case 'roomList':
          return { ...state, rooms: p.rooms };
        case 'playerGone': {
          const arrival = state.arrivalSeq + 1;
          const line: ActivityLine = { id: state.activitySeq, kind: 'info', params: { what: 'playerGone', name: p.name }, arrival };
          return {
            ...state,
            arrivalSeq: arrival,
            away: state.away.includes(p.playerId) ? state.away : [...state.away, p.playerId],
            activity: [...state.activity, line].slice(-50),
            activitySeq: state.activitySeq + 1,
          };
        }
        case 'playerBack': {
          const arrival = state.arrivalSeq + 1;
          const line: ActivityLine = { id: state.activitySeq, kind: 'info', params: { what: 'playerBack', name: p.name }, arrival };
          return {
            ...state,
            arrivalSeq: arrival,
            away: state.away.filter((id) => id !== p.playerId),
            activity: [...state.activity, line].slice(-50),
            activitySeq: state.activitySeq + 1,
          };
        }
        case 'roomClosed':
          // The room is dead — nothing to resume into.
          return { ...state, roomClosed: wireError(p.code, p.params) };
        case 'error':
          return { ...state, error: wireError(p.code, p.params) };
      }
    }
  }
}

const initial: GameState = {
  status: 'connecting',
  selfId: null,
  view: null,
  error: null,
  lastEventId: -1,
  chat: [],
  away: [],
  rooms: [],
  activity: [],
  activitySeq: 0,
  arrivalSeq: 0,
  logArrivals: {},
  roomClosed: null,
  left: false,
  session: 0,
};

export function useGame() {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);

  // A new session (leave / reset) closes the old socket and opens a fresh
  // one; the `alive` guard stops the dying socket's handlers from clobbering
  // the new connection's status.
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;
    let alive = true;
    ws.onopen = () => {
      if (!alive) return;
      dispatch({ type: 'status', status: 'open' });
      // Rejoin the seat this tab held before the refresh (if any).
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        ws.send(JSON.stringify({ type: 'resume', playerId: stored, lastEventId: -1 } satisfies ClientPacket));
      }
    };
    ws.onclose = () => { if (alive) dispatch({ type: 'status', status: 'closed' }); };
    ws.onerror = () => { if (alive) dispatch({ type: 'status', status: 'closed' }); };
    ws.onmessage = (event) => {
      try {
        dispatch({ type: 'packet', packet: JSON.parse(String(event.data)) as ServerPacket });
      } catch {
        // ignore malformed frames; the server's errors are the source of truth
      }
    };
    return () => {
      alive = false;
      ws.close();
    };
  }, [state.session]);

  // Keep the seat id across refreshes so resume can find it.
  useEffect(() => {
    if (state.selfId !== null) sessionStorage.setItem(STORAGE_KEY, state.selfId);
  }, [state.selfId]);

  // A failed resume (room expired, seat gone) arrives before any view exists;
  // drop the stored identity so the user can start fresh instead of looping.
  useEffect(() => {
    if (state.error !== null && state.view === null) sessionStorage.removeItem(STORAGE_KEY);
  }, [state.error, state.view]);

  // A roomClosed means the room is gone — its seat can never be resumed.
  useEffect(() => {
    if (state.roomClosed !== null) sessionStorage.removeItem(STORAGE_KEY);
  }, [state.roomClosed]);

  const send = useCallback((packet: ClientPacket) => {
    const ws = wsRef.current;
    if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(packet));
  }, []);

  const sendCreateRoom = useCallback((name: string, capacity: number) => {
    send({ type: 'createRoom', name, capacity });
  }, [send]);
  const sendJoinRoom = useCallback((name: string, roomCode: string) => {
    send({ type: 'joinRoom', roomCode, name });
  }, [send]);
  const sendPlayCard = useCallback((which: 0 | 1) => {
    send({ type: 'playCard', which });
  }, [send]);
  const sendChoice = useCallback((choice: Choice) => {
    send({ type: 'choice', choice });
  }, [send]);
  const sendNextRound = useCallback(() => send({ type: 'nextRound' }), [send]);
  const sendRematch = useCallback(() => send({ type: 'rematch' }), [send]);
  const sendChat = useCallback((text: string) => {
    send({ type: 'chat', text });
  }, [send]);
  /** Ask the server for the room directory (ticket 40). */
  const sendRoomList = useCallback(() => {
    send({ type: 'roomList' });
  }, [send]);
  // A browsing (Home) tab asks for the directory once its socket is live
  // (ticket 40): on a fresh load, after a leave, or after the room died. The
  // server keeps the list fresh with pushes while the socket stays a browser.
  useEffect(() => {
    if (state.status === 'open' && state.view === null) sendRoomList();
  }, [state.status, state.view, state.session, sendRoomList]);
  /** Leave for good (issue 11): tell the server, forget the identity, and
   *  open a fresh socket so Home works without a page reload. Fire-and-forget:
   *  leaving is always legal, so there is nothing to wait for. */
  const sendLeave = useCallback(() => {
    send({ type: 'leave' });
    sessionStorage.removeItem(STORAGE_KEY);
    dispatch({ type: 'left' });
  }, [send]);
  /** Back to Home after the room died under us (roomClosed). */
  const goHome = useCallback(() => dispatch({ type: 'reset' }), []);
  const clearError = useCallback(() => dispatch({ type: 'clearError' }), []);

  return {
    ...state,
    sendCreateRoom,
    sendJoinRoom,
    sendPlayCard,
    sendChoice,
    sendNextRound,
    sendRematch,
    sendChat,
    sendRoomList,
    sendLeave,
    goHome,
    clearError,
  };
}

export type Game = ReturnType<typeof useGame>;
