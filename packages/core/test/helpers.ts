/**
 * Test helpers: a seeded PRNG for determinism and small builders for hand-made
 * engine states (used to reach ruling edge cases that normal play rarely hits).
 */

import { CARD_INFO, defaultTokenTarget } from '../src/index.js';
import type { Card, Choice, Event, GameState, PlayerState, Rank } from '../src/index.js';

/** mulberry32 — tiny, deterministic, good enough for shuffling. */
export function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A player with sensible defaults; `id` doubles as the default name. */
export function p(id: string, opts: Partial<PlayerState> = {}): PlayerState {
  return { id, name: id, hand: [], discardPile: [], out: false, protected: false, tokens: 0, ...opts };
}

/** A card of the given rank. */
export function card(rank: Rank): Card {
  return { rank, name: CARD_INFO[rank].name };
}

/** A deck of exactly the given ranks, in order. */
export function deckOf(...ranks: Rank[]): Card[] {
  return ranks.map(card);
}

/** A round-phase state with the given players, the first seated in turn. */
export function makeGame(players: PlayerState[], opts: Partial<GameState> = {}): GameState {
  return {
    phase: 'round',
    roomCode: 'TEST',
    capacity: players.length as 2 | 3 | 4,
    tokenTarget: defaultTokenTarget(players.length),
    players,
    deck: [],
    burned: null,
    faceUpRemoved: [],
    currentTurn: players[0]!.id,
    pendingChoice: null,
    roundNumber: 1,
    roundWinnerIds: [],
    matchWinnerId: null,
    ...opts,
  };
}

/** Build a lobby state with `capacity` seats and the given player ids seated. */
export function makeLobby(capacity: 2 | 3 | 4, playerIds: string[]): GameState {
  return {
    phase: 'lobby',
    roomCode: 'TEST',
    capacity,
    tokenTarget: defaultTokenTarget(capacity),
    players: playerIds.map((id) => p(id)),
    deck: [],
    burned: null,
    faceUpRemoved: [],
    currentTurn: null,
    pendingChoice: null,
    roundNumber: 0,
    roundWinnerIds: [],
    matchWinnerId: null,
  };
}

/** A Guard's choice payload — the only kind that names a card. */
export function guardChoice(targetPlayerId: string, namedRank: Rank): Choice {
  return { kind: 'guard', targetPlayerId, namedRank };
}

/** Collect the events of a given type, narrowed to that event's shape. */
export function eventsOf<K extends Event['type']>(events: Event[], type: K): Extract<Event, { type: K }>[] {
  return events.filter((e): e is Extract<Event, { type: K }> => e.type === type);
}
