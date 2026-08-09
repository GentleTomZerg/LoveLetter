/**
 * Scripted full-match simulation: random-but-legal plays (ticket 04 will make
 * this exhaustive). Every match here must terminate, never deadlock, never
 * reject a legal intent, and end with a winner at the token target.
 */

import { describe, expect, it } from 'vitest';
import { apply, defaultTokenTarget } from '../src/index.js';
import type { Event, GameState, Intent } from '../src/index.js';
import { eventsOf, seededRng } from './helpers.js';

function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

/** The next legal intent a random (but honest) player would send. */
function randomIntent(s: GameState, rng: () => number): Intent {
  if (s.phase === 'roundEnded') return { type: 'nextRound', playerId: s.players[0]!.id };
  const pc = s.pendingChoice;
  if (pc !== null) {
    if (pc.kind === 'guard') {
      return {
        type: 'choice',
        playerId: pc.playerId,
        choice: {
          kind: 'guard',
          targetPlayerId: pick(pc.targets, rng),
          namedRank: pick(pc.namedOptions, rng),
        },
      };
    }
    return {
      type: 'choice',
      playerId: pc.playerId,
      choice: { kind: pc.kind, targetPlayerId: pick(pc.targets, rng) },
    };
  }
  const actor = s.players.find((p) => p.id === s.currentTurn)!;
  // A hand can have one card (after a forced Countess discard).
  const which = actor.hand.length > 1 && rng() < 0.5 ? 1 : 0;
  return { type: 'playCard', playerId: s.currentTurn!, which };
}

function runMatch(seed: number, capacity: 2 | 3 | 4): { state: GameState; events: Event[]; steps: number } {
  const rng = seededRng(seed);
  let result = apply(null, {
    type: 'createRoom',
    roomCode: 'SIMO',
    capacity,
    playerId: 'A',
    playerName: 'Alice',
  }, rng);
  if (!result.ok) throw new Error(result.error);
  let state = result.state;
  const events = [...result.events];
  const names = ['Bob', 'Carol', 'Dave'];
  for (let i = 0; i < capacity - 1; i++) {
    result = apply(state, { type: 'joinRoom', playerId: String.fromCharCode(66 + i), playerName: names[i]! }, rng);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    events.push(...result.events);
  }

  let steps = 0;
  while (state.phase !== 'matchEnded') {
    const intent = randomIntent(state, rng);
    result = apply(state, intent, rng);
    if (!result.ok) throw new Error(`legal intent rejected: ${JSON.stringify(intent)} → ${result.error}`);
    state = result.state;
    events.push(...result.events);
    steps += 1;
    if (steps > 500) throw new Error('match did not terminate');
  }
  return { state, events, steps };
}

describe('random-play full-match simulation (full 16-card deck)', () => {
  for (const capacity of [2, 3, 4] as const) {
    const target = defaultTokenTarget(capacity);
    it(`terminates with a winner at ${target} tokens for ${capacity} players`, () => {
      for (let seed = 1; seed <= 10; seed++) {
        const { state, events, steps } = runMatch(seed, capacity);
        expect(state.phase).toBe('matchEnded');
        expect(state.matchWinnerId).not.toBeNull();
        const winner = state.players.find((p) => p.id === state.matchWinnerId)!;
        expect(winner.tokens).toBeGreaterThanOrEqual(target);
        // every round ended with a winner; the match ended exactly once
        const roundEnds = eventsOf(events, 'roundEnded').length;
        expect(roundEnds).toBeGreaterThan(0);
        expect(eventsOf(events, 'matchEnded')).toHaveLength(1);
        expect(eventsOf(events, 'roundStarted')).toHaveLength(roundEnds);
        expect(steps).toBeLessThan(500);
      }
    });
  }

  it('reaches the 7-token target over several rounds in a 2-player match', () => {
    for (const seed of [11, 12, 13]) {
      const { state, events } = runMatch(seed, 2);
      expect(state.matchWinnerId).not.toBeNull();
      const winner = state.players.find((p) => p.id === state.matchWinnerId)!;
      expect(winner.tokens).toBe(7);
      expect(eventsOf(events, 'roundStarted').length).toBeGreaterThanOrEqual(7);
    }
  });

  it('every card type resolves without rejection over a batch of matches', () => {
    const resolved = new Set<number>();
    let applies = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { events } = runMatch(seed, 2);
      applies += events.length;
      for (const e of events) {
        if (e.type === 'cardPlayed' || e.type === 'cardDiscarded') resolved.add(e.card.rank);
      }
    }
    expect(resolved).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(applies).toBeGreaterThan(400); // a healthy number of transitions
  });

  it('rematch after the sim resets to a fresh round 1 with the same seats', () => {
    const rng = seededRng(99);
    const { state } = runMatch(99, 2);
    expect(state.phase).toBe('matchEnded');
    const result = apply(state, { type: 'rematch', playerId: state.players[0]!.id }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('round');
    expect(result.state.roundNumber).toBe(1);
    expect(result.state.players.map((p) => p.id)).toEqual(state.players.map((p) => p.id));
    expect(result.state.players.every((p) => p.tokens === 0)).toBe(true);
  });
});
