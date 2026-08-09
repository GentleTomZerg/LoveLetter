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
  ServerPacket,
  ViewState,
} from '@love-letter/core';

export type ConnStatus = 'connecting' | 'open' | 'closed';

export interface GameState {
  status: ConnStatus;
  selfId: string | null;
  view: ViewState | null;
  error: string | null;
  /** The log id the view covers; only newer events are folded. */
  lastEventId: number;
  /** Room chat, rendered by the Game screen (ticket 06). */
  chat: ChatMessage[];
}

type Action =
  | { type: 'status'; status: ConnStatus }
  | { type: 'packet'; packet: ServerPacket }
  | { type: 'clearError' };

const STORAGE_KEY = 'love-letter-player-id';

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status };
    case 'clearError':
      return { ...state, error: null };
    case 'packet': {
      const p = action.packet;
      switch (p.type) {
        case 'hello':
          return { ...state, selfId: p.playerId, error: null };
        case 'snapshot':
          // A fresh client starts from the snapshot; a resuming client that
          // kept its view folds the replayed events onto it instead.
          return state.view === null
            ? { ...state, view: p.view, lastEventId: p.lastEventId, error: null }
            : state;
        case 'event':
          return state.view !== null && state.selfId !== null && p.id > state.lastEventId
            ? {
              ...state,
              view: reduceView(state.view, p.event, state.selfId),
              lastEventId: p.id,
            }
            : state;
        case 'chat':
          return { ...state, chat: [...state.chat, p.message] };
        case 'chatLog':
          return { ...state, chat: [...p.messages] };
        case 'error':
          return { ...state, error: p.message };
      }
    }
  }
}

const initial: GameState = { status: 'connecting', selfId: null, view: null, error: null, lastEventId: -1, chat: [] };

export function useGame() {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;
    ws.onopen = () => {
      dispatch({ type: 'status', status: 'open' });
      // Rejoin the seat this tab held before the refresh (if any).
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        ws.send(JSON.stringify({ type: 'resume', playerId: stored, lastEventId: -1 } satisfies ClientPacket));
      }
    };
    ws.onclose = () => dispatch({ type: 'status', status: 'closed' });
    ws.onerror = () => dispatch({ type: 'status', status: 'closed' });
    ws.onmessage = (event) => {
      try {
        dispatch({ type: 'packet', packet: JSON.parse(String(event.data)) as ServerPacket });
      } catch {
        // ignore malformed frames; the server's errors are the source of truth
      }
    };
    return () => ws.close();
  }, []);

  // Keep the seat id across refreshes so resume can find it.
  useEffect(() => {
    if (state.selfId !== null) sessionStorage.setItem(STORAGE_KEY, state.selfId);
  }, [state.selfId]);

  // A failed resume (room expired, seat gone) arrives before any view exists;
  // drop the stored identity so the user can start fresh instead of looping.
  useEffect(() => {
    if (state.error !== null && state.view === null) sessionStorage.removeItem(STORAGE_KEY);
  }, [state.error, state.view]);

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
    clearError,
  };
}

export type Game = ReturnType<typeof useGame>;
