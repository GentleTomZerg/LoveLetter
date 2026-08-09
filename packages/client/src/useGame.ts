/**
 * Connection hook: opens the WebSocket, folds server packets into the view
 * using the core reducer, and exposes typed send helpers.
 *
 * The client is deliberately thin — the server owns all state; here we just
 * render whatever the event stream describes.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { reduceView } from '@love-letter/core';
import type { ClientPacket, Rank, ServerPacket, ViewState } from '@love-letter/core';

export type ConnStatus = 'connecting' | 'open' | 'closed';

export interface GameState {
  status: ConnStatus;
  selfId: string | null;
  view: ViewState | null;
  error: string | null;
}

type Action =
  | { type: 'status'; status: ConnStatus }
  | { type: 'packet'; packet: ServerPacket }
  | { type: 'clearError' };

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
          return { ...state, view: p.view, error: null };
        case 'event':
          return state.selfId !== null && state.view !== null
            ? { ...state, view: reduceView(state.view, p.event, state.selfId) }
            : state;
        case 'error':
          return { ...state, error: p.message };
      }
    }
  }
}

const initial: GameState = { status: 'connecting', selfId: null, view: null, error: null };

export function useGame() {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;
    ws.onopen = () => dispatch({ type: 'status', status: 'open' });
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
  const sendChoice = useCallback((choice: { targetPlayerId: string; namedRank: Rank }) => {
    send({ type: 'choice', choice });
  }, [send]);
  const sendNextRound = useCallback(() => send({ type: 'nextRound' }), [send]);
  const sendRematch = useCallback(() => send({ type: 'rematch' }), [send]);
  const clearError = useCallback(() => dispatch({ type: 'clearError' }), []);

  return {
    ...state,
    sendCreateRoom,
    sendJoinRoom,
    sendPlayCard,
    sendChoice,
    sendNextRound,
    sendRematch,
    clearError,
  };
}

export type Game = ReturnType<typeof useGame>;
