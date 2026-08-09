/**
 * Scripted full-match simulation: random-but-legal plays, the fast canary
 * version. The exhaustive thousands-of-match stress suite with per-apply
 * invariants lives in `random-play-simulation.test.ts` (ticket 04); this file
 * keeps the small behavioral assertions the original driver grew.
 */

import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { runMatch, seededRng } from './sim.js';

describe('random-play full-match simulation (full 16-card deck)', () => {
  it('reaches the 7-token target over several rounds in a 2-player match', () => {
    for (const seed of [11, 12, 13]) {
      const { state, rounds } = runMatch(seed, 2);
      expect(state.matchWinnerId).not.toBeNull();
      const winner = state.players.find((p) => p.id === state.matchWinnerId)!;
      expect(winner.tokens).toBe(7);
      expect(rounds).toBeGreaterThanOrEqual(7);
    }
  });

  it('every card type resolves without rejection over a batch of matches', () => {
    const resolved = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const { ranksResolved } = runMatch(seed, 2);
      for (const rank of ranksResolved) resolved.add(rank);
    }
    expect(resolved).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  it('rematch after the sim resets to a fresh round 1 with the same seats', () => {
    const { state } = runMatch(99, 2);
    expect(state.phase).toBe('matchEnded');
    const rng = seededRng(99);
    const result = apply(state, { type: 'rematch', playerId: state.players[0]!.id }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('round');
    expect(result.state.roundNumber).toBe(1);
    expect(result.state.players.map((p) => p.id)).toEqual(state.players.map((p) => p.id));
    expect(result.state.players.every((p) => p.tokens === 0)).toBe(true);
  });
});
