import { describe, expect, it } from 'vitest';
import { apply, buildDeck, cardOf, forcedDiscard } from '../src/index.js';
import type { Event, GameState, Intent } from '../src/index.js';
import { eventsOf, seededRng } from './helpers.js';

/** Create a room and join until full; returns the final state and all events. */
function startMatch(
  capacity: 2 | 3 | 4,
  rng: () => number,
  tokenTarget?: number,
): { state: GameState; events: Event[] } {
  const create: Intent = tokenTarget === undefined
    ? { type: 'createRoom', roomCode: 'TEST', capacity, playerId: 'A', playerName: 'Alice' }
    : { type: 'createRoom', roomCode: 'TEST', capacity, playerId: 'A', playerName: 'Alice', tokenTarget };
  let result = apply(null, create, rng);
  if (!result.ok) throw new Error(`createRoom failed: ${result.error}`);
  let state = result.state;
  const events = [...result.events];
  const others = ['Bob', 'Carol', 'Dave'].slice(0, capacity - 1);
  for (let i = 0; i < others.length; i++) {
    result = apply(state, { type: 'joinRoom', playerId: String.fromCharCode(66 + i), playerName: others[i]! }, rng);
    if (!result.ok) throw new Error(`joinRoom failed: ${result.error}`);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}

describe('deck composition', () => {
  it('builds the exact 16-card original deck', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(16);
    const counts = new Map<number, number>();
    for (const c of deck) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
    expect(counts.get(1)).toBe(5); // Guard ×5
    expect(counts.get(2)).toBe(2); // Priest ×2
    expect(counts.get(3)).toBe(2); // Baron ×2
    expect(counts.get(4)).toBe(2); // Handmaid ×2
    expect(counts.get(5)).toBe(2); // Prince ×2
    expect(counts.get(6)).toBe(1); // King ×1
    expect(counts.get(7)).toBe(1); // Countess ×1
    expect(counts.get(8)).toBe(1); // Princess ×1
  });

  it('names cards correctly', () => {
    expect(cardOf(1).name).toBe('Guard');
    expect(cardOf(8).name).toBe('Princess');
  });
});

describe('forced discard (Countess, rules spec §4.7)', () => {
  it('forces the Countess while the hand also holds the King', () => {
    expect(forcedDiscard([cardOf(7), cardOf(6)])).toBe(7);
  });

  it('forces the Countess while the hand also holds the Prince', () => {
    expect(forcedDiscard([cardOf(5), cardOf(7)])).toBe(7);
  });

  it('does not force anything without the Countess', () => {
    expect(forcedDiscard([cardOf(5), cardOf(6)])).toBeNull();
    expect(forcedDiscard([cardOf(7), cardOf(8)])).toBeNull(); // Princess does not trigger her
  });

  it('does not force anything with a lone Countess or an empty hand', () => {
    expect(forcedDiscard([cardOf(7)])).toBeNull();
    expect(forcedDiscard([])).toBeNull();
  });

  it('agrees with the engine: a play is rejected while a forced discard is due', () => {
    const rng = seededRng(3);
    let result = apply(null, { type: 'createRoom', roomCode: 'TEST', capacity: 2, playerId: 'A', playerName: 'Alice' }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let state = result.state;
    result = apply(state, { type: 'joinRoom', playerId: 'B', playerName: 'Bob' }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    state = result.state;

    // Hand-built: Alice holds the Countess + Prince, so the Prince play must fail.
    const alice = state.players[0]!;
    alice.hand = [cardOf(7), cardOf(5)];
    expect(forcedDiscard(alice.hand)).toBe(7);
    result = apply(state, { type: 'playCard', playerId: 'A', which: 1 }, rng);
    if (result.ok) throw new Error('expected the Prince play to be rejected');
    expect(result.error).toMatch(/countess/i);
  });
});

describe('round setup per player count (rules spec §2)', () => {
  it('2 players: burns 1 face-down, removes 3 face-up, deals 1 each', () => {
    const rng = seededRng(42);
    const { state, events } = startMatch(2, rng);
    const started = eventsOf(events, 'roundStarted')[0]!;
    expect(state.phase).toBe('round');
    expect(state.burned).not.toBeNull();
    expect(state.faceUpRemoved).toHaveLength(3);
    expect(state.players[0]!.hand).toHaveLength(2); // first player has already drawn
    expect(state.players[1]!.hand).toHaveLength(1);
    // 16 − 1 burned − 3 face-up − 2 dealt = 10 at deal time
    expect(started.deckCount).toBe(10);
    expect(started.faceUpRemoved).toHaveLength(3);
    // ...and the first player has already drawn, so the state deck is 9
    expect(state.deck).toHaveLength(9);
    expect(eventsOf(events, 'cardDealt')).toHaveLength(2);
  });

  it('3 players: no face-up removals, 12-card draw deck', () => {
    const rng = seededRng(7);
    const { state, events } = startMatch(3, rng);
    const started = eventsOf(events, 'roundStarted')[0]!;
    expect(state.faceUpRemoved).toHaveLength(0);
    expect(started.deckCount).toBe(12);
    expect(state.deck).toHaveLength(11);
    expect(eventsOf(events, 'cardDealt')).toHaveLength(3);
  });

  it('4 players: no face-up removals, 11-card draw deck', () => {
    const rng = seededRng(99);
    const { state, events } = startMatch(4, rng);
    const started = eventsOf(events, 'roundStarted')[0]!;
    expect(started.deckCount).toBe(11);
    expect(state.deck).toHaveLength(10);
    expect(eventsOf(events, 'cardDealt')).toHaveLength(4);
  });
});
