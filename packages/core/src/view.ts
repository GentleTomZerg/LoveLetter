/**
 * Client-side view of the game, rebuilt from the event stream.
 *
 * The engine owns the authoritative state; clients render a projection of it.
 * `buildView` snapshots a player's view (their own hand is private), and
 * `reduceView` folds each event into that view — the same fold a reconnecting
 * client would replay later (ticket 05).
 */

import { CARD_INFO } from './cards.js';
import type { Card, Event, GameState, PendingChoice, Phase } from './types.js';

export interface PlayerView {
  id: string;
  name: string;
  tokens: number;
  out: boolean;
  protected: boolean;
  /** Discarded cards, face-up in play order — public. */
  discardPile: Card[];
}

export type LogKind = 'play' | 'fizzle' | 'choice' | 'reveal' | 'eliminate' | 'round' | 'match' | 'join' | 'info';

export interface LogEntry {
  id: number;
  kind: LogKind;
  text: string;
}

/** Everything one player sees, including their own (private) hand. */
export interface ViewState {
  phase: Phase;
  roomCode: string;
  capacity: number;
  tokenTarget: number;
  roundNumber: number;
  players: PlayerView[];
  currentTurn: string | null;
  pendingChoice: PendingChoice | null;
  deckCount: number;
  burnedCount: number;
  faceUpRemoved: Card[];
  roundWinnerIds: string[];
  matchWinnerId: string | null;
  hand: Card[];
  log: LogEntry[];
  logSeq: number;
}

/** Build a snapshot of the state from `selfId`'s point of view. */
export function buildView(state: GameState, selfId: string): ViewState {
  const self = state.players.find((p) => p.id === selfId);
  return {
    phase: state.phase,
    roomCode: state.roomCode,
    capacity: state.capacity,
    tokenTarget: state.tokenTarget,
    roundNumber: state.roundNumber,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      tokens: p.tokens,
      out: p.out,
      protected: p.protected,
      discardPile: [...p.discardPile],
    })),
    currentTurn: state.currentTurn,
    pendingChoice: state.pendingChoice ? { ...state.pendingChoice } : null,
    deckCount: state.deck.length,
    burnedCount: state.burned === null ? 0 : 1,
    faceUpRemoved: [...state.faceUpRemoved],
    roundWinnerIds: [...state.roundWinnerIds],
    matchWinnerId: state.matchWinnerId,
    hand: self ? [...self.hand] : [],
    log: [],
    logSeq: 0,
  };
}

/**
 * Fold one event into the view. The server only ever sends a player their own
 * private events (`cardDealt`, `cardDrawn`), so the fold can trust them.
 */
export function reduceView(view: ViewState | null, event: Event, selfId: string): ViewState | null {
  if (view === null) return null;
  const v = structuredClone(view);

  const name = (id: string) =>
    id === selfId ? 'You' : (v.players.find((p) => p.id === id)?.name ?? id);
  const log = (kind: LogKind, text: string) => {
    v.logSeq += 1;
    v.log.push({ id: v.logSeq, kind, text });
  };

  switch (event.type) {
    case 'roomCreated':
      v.roomCode = event.roomCode;
      v.capacity = event.capacity;
      log('info', `Room ${event.roomCode} created`);
      break;

    case 'playerJoined':
      v.players.push({
        id: event.player.id,
        name: event.player.name,
        tokens: 0,
        out: false,
        protected: false,
        discardPile: [],
      });
      log('join', `${event.player.name} joined`);
      break;

    case 'rematchStarted':
      for (const p of v.players) {
        p.tokens = 0;
        p.out = false;
        p.protected = false;
        p.discardPile = [];
      }
      v.roundNumber = 0;
      v.matchWinnerId = null;
      v.roundWinnerIds = [];
      v.hand = [];
      log('info', 'Rematch — a new match begins');
      break;

    case 'roundStarted':
      v.phase = 'round';
      v.roundNumber = event.roundNumber;
      v.deckCount = event.deckCount;
      v.faceUpRemoved = event.faceUpRemoved;
      v.currentTurn = event.firstPlayerId;
      v.pendingChoice = null;
      v.roundWinnerIds = [];
      for (const p of v.players) {
        p.out = false;
        p.protected = false;
        p.discardPile = [];
      }
      v.hand = [];
      log('info', `Round ${event.roundNumber} begins`);
      break;

    case 'cardDealt':
      if (event.playerId === selfId && event.card) v.hand = [event.card];
      break;

    case 'turnStarted':
      v.currentTurn = event.playerId;
      break;

    case 'cardDrawn':
      // Every draw is public table state (the deck shrinks); the card itself
      // only arrives on the drawing player's own stream.
      v.deckCount = Math.max(0, v.deckCount - 1);
      if (event.playerId === selfId && event.card) v.hand = [...v.hand, event.card];
      break;

    case 'cardPlayed': {
      const player = v.players.find((p) => p.id === event.playerId);
      if (player) player.discardPile = [...player.discardPile, event.card];
      if (event.playerId === selfId) {
        v.hand = v.hand.filter((_, i) => i !== event.which);
      }
      log('play', `${name(event.playerId)} played ${event.card.name}`);
      break;
    }

    case 'cardFizzled':
      log('fizzle', `${name(event.playerId)}'s ${event.card.name} had no legal target`);
      break;

    case 'choiceRequired':
      v.pendingChoice = event.pendingChoice;
      log('choice', event.playerId === selfId ? 'You must choose a target and a card' : `${name(event.playerId)} is choosing…`);
      break;

    case 'choiceMade': {
      v.pendingChoice = null;
      const named = CARD_INFO[event.choice.namedRank]?.name ?? `rank ${event.choice.namedRank}`;
      log('choice', `${name(event.playerId)} guessed ${name(event.choice.targetPlayerId)} has ${named}`);
      break;
    }

    case 'handRevealed': {
      const player = v.players.find((p) => p.id === event.playerId);
      if (player) player.discardPile = [...player.discardPile, event.card];
      log('reveal', `${name(event.playerId)} revealed ${event.card.name}`);
      break;
    }

    case 'playerEliminated':
      v.players.find((p) => p.id === event.playerId)!.out = true;
      log('eliminate', `${name(event.playerId)} is out`);
      break;

    case 'roundEnded':
      v.phase = 'roundEnded';
      v.roundWinnerIds = [...event.winnerIds];
      v.currentTurn = null;
      v.pendingChoice = null;
      for (const id of event.winnerIds) {
        const winner = v.players.find((p) => p.id === id);
        if (winner) winner.tokens += 1;
      }
      log('round', `${event.winnerIds.map(name).join(' and ')} won the round (${event.reason === 'last-standing' ? 'last player standing' : 'highest hand'})`);
      break;

    case 'matchEnded':
      v.phase = 'matchEnded';
      v.matchWinnerId = event.winnerId;
      log('match', `${name(event.winnerId)} won the match!`);
      break;
  }

  return v;
}
