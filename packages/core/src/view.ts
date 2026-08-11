/**
 * Client-side view of the game, rebuilt from the event stream.
 *
 * The engine owns the authoritative state; clients render a projection of it.
 * `buildView` snapshots a player's view (their own hand is private), and
 * `reduceView` folds each event into that view — the same fold a reconnecting
 * client would replay later (ticket 05).
 */

import type { Card, Event, GameState, PendingChoice, Phase } from './types.js';
export interface PlayerView {
  id: string;
  name: string;
  tokens: number;
  out: boolean;
  protected: boolean;
  /** Discarded cards, face-up in play order — public. */
  discardPile: Card[];
  /** Cards currently held — the count is public (hand size is open table state in Love Letter); the cards themselves stay private. */
  handCount: number;
}

export type LogKind = 'play' | 'fizzle' | 'choice' | 'guard' | 'baron' | 'prince' | 'king' | 'peek' | 'discard' | 'reveal' | 'eliminate' | 'round' | 'match' | 'join' | 'leave' | 'info' | 'miss' | 'tie';

/**
 * Structured facts behind a log entry. The client's locale dictionary turns
 * them into display text (ADR-0003): players are ids (the renderer resolves
 * "You"/names per locale), cards are ranks, info lines carry a `what` sub-key.
 */
export type LogParams = Record<string, string | number | string[]>;

export interface LogEntry {
  id: number;
  kind: LogKind;
  params: LogParams;
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
  /** Every player who ever joined, id → name (never shrinks) — historical log lines resolve names after a player leaves. */
  roster: Record<string, string>;
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
      handCount: p.hand.length,
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
    roster: Object.fromEntries(state.players.map((p) => [p.id, p.name])),
  };
}

/** Remove a single card equal to `card` from the hand (duplicates allowed). */
function removeCard(hand: Card[], card: Card): Card[] {
  const index = hand.findIndex((c) => c.rank === card.rank && c.name === card.name);
  if (index === -1) return hand;
  const next = [...hand];
  next.splice(index, 1);
  return next;
}

/**
 * Fold one event into the view. The server only ever sends a player their own
 * private events (`cardDealt`, `cardDrawn`), so the fold can trust them.
 */
export function reduceView(view: ViewState | null, event: Event, selfId: string): ViewState | null {
  if (view === null) return null;
  const v = structuredClone(view);

  const log = (kind: LogKind, params: LogParams) => {
    v.logSeq += 1;
    v.log.push({ id: v.logSeq, kind, params });
  };

  switch (event.type) {
    case 'roomCreated':
      v.roomCode = event.roomCode;
      v.capacity = event.capacity;
      log('info', { what: 'roomCreated', roomCode: event.roomCode, capacity: event.capacity });
      break;

    case 'playerJoined':
      v.players.push({
        id: event.player.id,
        name: event.player.name,
        tokens: 0,
        out: false,
        protected: false,
        discardPile: [],
        handCount: 0,
      });
      v.roster[event.player.id] = event.player.name;
      log('join', { playerId: event.player.id });
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
      for (const p of v.players) p.handCount = 0;
      log('info', { what: 'rematchStarted' });
      break;

    case 'roundStarted':
      v.phase = 'round';
      v.roundNumber = event.roundNumber;
      v.deckCount = event.deckCount;
      v.faceUpRemoved = event.faceUpRemoved;
      v.burnedCount = 1; // every round removes one card face-down at setup
      v.currentTurn = event.firstPlayerId;
      v.pendingChoice = null;
      v.roundWinnerIds = [];
      for (const p of v.players) {
        p.out = false;
        p.protected = false;
        p.discardPile = [];
        p.handCount = 0;
      }
      v.hand = [];
      log('info', { what: 'roundStarted', roundNumber: event.roundNumber });
      break;

    case 'cardDealt':
      // Each player is dealt exactly one card at round start.
      v.players.find((p) => p.id === event.playerId)!.handCount = 1;
      if (event.playerId === selfId && event.card) v.hand = [event.card];
      break;

    case 'turnStarted':
      v.currentTurn = event.playerId;
      // Handmaid immunity ends at the start of your next turn (§8.3).
      v.players.find((p) => p.id === event.playerId)!.protected = false;
      break;

    case 'cardDrawn':
      // Every draw is public table state (the deck shrinks); the card itself
      // only arrives on the drawing player's own stream. A draw when the deck
      // is already empty is the face-down burned card leaving the burn pile
      // (ruling 4 — the face-up 2-player removals are never drawn).
      if (v.deckCount === 0) v.burnedCount = 0;
      v.deckCount = Math.max(0, v.deckCount - 1);
      // A draw always puts one more card in that player's hand.
      v.players.find((p) => p.id === event.playerId)!.handCount += 1;
      if (event.playerId === selfId && event.card) v.hand = [...v.hand, event.card];
      break;

    case 'cardPlayed': {
      const player = v.players.find((p) => p.id === event.playerId);
      if (player) {
        player.discardPile = [...player.discardPile, event.card];
        player.handCount -= 1; // the played card left their hand
        if (event.card.rank === 4) player.protected = true; // Handmaid (§4.4)
      }
      if (event.playerId === selfId) {
        v.hand = v.hand.filter((_, i) => i !== event.which);
      }
      log('play', { playerId: event.playerId, rank: event.card.rank });
      break;
    }

    case 'cardFizzled':
      log('fizzle', { playerId: event.playerId, rank: event.card.rank });
      break;

    case 'choiceRequired':
      v.pendingChoice = event.pendingChoice;
      log('choice', { playerId: event.playerId });
      break;

    case 'choiceMade': {
      v.pendingChoice = null;
      const c = event.choice;
      switch (c.kind) {
        case 'guard':
          log('guard', { playerId: event.playerId, targetId: c.targetPlayerId, rank: c.namedRank });
          break;
        case 'priest':
          break; // the peek event carries the interesting log line
        case 'baron':
          log('baron', { playerId: event.playerId, targetId: c.targetPlayerId });
          break;
        case 'prince':
          log('prince', { playerId: event.playerId, targetId: c.targetPlayerId });
          break;
        case 'king':
          log('king', { playerId: event.playerId, targetId: c.targetPlayerId });
          break;
      }
      break;
    }

    case 'choiceAbandoned':
      v.pendingChoice = null;
      log('info', { what: 'choiceAbandoned', playerId: event.playerId });
      break;

    case 'guardMissed':
      // The resolution's completion (ticket 26): a wrong Guard guess reveals
      // nothing — the entry names the (public) guess and the played card.
      log('miss', {
        playerId: event.playerId,
        targetId: event.targetId,
        rank: event.guessRank,
        played: event.rank,
      });
      break;

    case 'baronTied':
      // The resolution's completion (ticket 26): equal hands reveal nothing —
      // the entry names who compared, against whom, and the played Baron.
      log('tie', { playerId: event.playerId, targetId: event.targetId, rank: event.rank });
      break;

    case 'handTraded':
      // A trade replaces your whole hand; others only learn it happened.
      // Hand size is public, so the event carries the received hand's count
      // (King can swap unequal hands — e.g. after a forced Countess discard).
      v.players.find((p) => p.id === event.playerId)!.handCount = event.count;
      if (event.playerId === selfId && event.card) v.hand = [event.card];
      break;

    case 'handPeeked': {
      const params: LogParams = { playerId: event.playerId, targetId: event.targetPlayerId };
      // Only the peeker's stream carries the card; others just learn a peek happened.
      if (event.playerId === selfId && event.card) params.rank = event.card.rank;
      log('peek', params);
      break;
    }

    case 'cardDiscarded': {
      const player = v.players.find((p) => p.id === event.playerId);
      if (player) {
        player.discardPile = [...player.discardPile, event.card];
        player.handCount -= 1; // Prince target or forced Countess — one card left the hand
      }
      if (event.playerId === selfId) v.hand = removeCard(v.hand, event.card);
      log('discard', { playerId: event.playerId, rank: event.card.rank, reason: event.reason });
      break;
    }

    case 'handRevealed': {
      const player = v.players.find((p) => p.id === event.playerId);
      if (player) {
        player.discardPile = [...player.discardPile, event.card];
        player.handCount -= 1; // elimination / deck-empty reveal — the card left their hand
      }
      if (event.playerId === selfId) v.hand = removeCard(v.hand, event.card);
      log('reveal', { playerId: event.playerId, rank: event.card.rank });
      break;
    }

    case 'playerEliminated':
      v.players.find((p) => p.id === event.playerId)!.out = true;
      log('eliminate', { playerId: event.playerId, reason: event.reason });
      break;

    case 'playerLeft':
      // The seat is gone for good (issue 11) — its row leaves the table.
      // The roster keeps the name so historical log lines still resolve.
      v.players = v.players.filter((p) => p.id !== event.playerId);
      v.roundWinnerIds = v.roundWinnerIds.filter((id) => id !== event.playerId);
      log('leave', { playerId: event.playerId });
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
      log('round', { winners: event.winnerIds, reason: event.reason });
      break;

    case 'matchEnded':
      v.phase = 'matchEnded';
      v.matchWinnerId = event.winnerId;
      log('match', { winnerId: event.winnerId });
      break;
  }

  return v;
}
