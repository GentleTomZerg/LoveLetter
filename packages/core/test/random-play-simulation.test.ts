/**
 * Exhaustive random-play simulation (ticket 04): the confidence net that
 * catches rules bugs hiding in interactions.
 *
 * 1000 seeded matches per player count (3000 total), each played from an empty
 * room to `matchEnded` with random-but-legal moves. Every `apply` is checked
 * against the full invariant set in `sim.ts` (hands ≤ 2, card conservation,
 * setup counts, eliminated players never act, protection expiry) — a violation
 * makes the whole run fail. The driver also refuses to continue if a legal
 * intent is ever rejected or a match fails to terminate (500-step cap), so
 * "never throws, never deadlocks, always terminates" is enforced per match.
 *
 * Runtime: measured ~5s for the whole 3000-match sweep (2p ~1s, 3p ~1.7s,
 * 4p ~1.9s on this machine). Each capacity test bounds itself twice: a
 * deterministic per-match step cap, and a wall-clock assertion with generous
 * headroom, with the vitest timeout as the hard backstop.
 */

import { describe, expect, it } from 'vitest';
import { apply, defaultTokenTarget } from '../src/index.js';
import type { GameState, Intent } from '../src/index.js';
import { MAX_STEPS, randomIntent, runMatch, seededRng } from './sim.js';

const ALL_RANKS = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
const ROUND_END_REASONS = ['last-standing', 'highest-hand'] as const;
/** Wall-clock bound per capacity run; measured ~1–2s, so ~7–15× headroom. */
const RUNTIME_BUDGET_MS = 15_000;
/** Far below any measured batch — the sweep must exercise plenty of churn. */
const MIN_BATCH_STEPS = 10_000;

/** Play `count` matches of one capacity, asserting the full contract. */
function runSweep(count: number, capacity: 2 | 3 | 4): void {
  const target = defaultTokenTarget(capacity);
  const started = Date.now();
  let maxSteps = 0;
  let totalSteps = 0;
  const ranks = new Set<number>();
  const reasons = new Set<string>();

  for (let seed = 1; seed <= count; seed++) {
    const { state, steps, rounds, roundEndReasons, ranksResolved } = runMatch(seed, capacity);

    // The match ended with a winner at the token target (7/5/4).
    expect(state.phase).toBe('matchEnded');
    expect(state.matchWinnerId).not.toBeNull();
    const winner = state.players.find((p) => p.id === state.matchWinnerId)!;
    expect(winner.tokens).toBe(target);
    expect(rounds).toBeGreaterThanOrEqual(target);

    // Every round produced a winner and ended legally.
    for (const reason of roundEndReasons) {
      expect(ROUND_END_REASONS).toContain(reason);
      reasons.add(reason);
    }

    for (const rank of ranksResolved) ranks.add(rank);
    maxSteps = Math.max(maxSteps, steps);
    totalSteps += steps;
  }

  // No deadlock: every match terminated well under the step cap.
  expect(maxSteps).toBeLessThan(MAX_STEPS);
  // A healthy amount of play happened (1000 matches × ~90–150 applies each).
  expect(totalSteps).toBeGreaterThan(MIN_BATCH_STEPS);
  // Across the batch, every card rank resolved and both round endings occurred.
  expect(ranks).toEqual(ALL_RANKS);
  expect(reasons).toEqual(new Set(ROUND_END_REASONS));
  // Bounded runtime: the sweep completes in a few seconds, not minutes.
  expect(Date.now() - started).toBeLessThan(RUNTIME_BUDGET_MS);
}

describe('random-play simulation: thousands of full matches (ticket 04)', () => {
  it('1000 two-player matches terminate with a 7-token winner, invariants held', () => {
    runSweep(1000, 2);
  }, 30_000);

  it('1000 three-player matches terminate with a 5-token winner, invariants held', () => {
    runSweep(1000, 3);
  }, 30_000);

  it('1000 four-player matches terminate with a 4-token winner, invariants held', () => {
    runSweep(1000, 4);
  }, 30_000);
});

describe('random-play simulation: illegal intents', () => {
  /** Intents that must be rejected for the given state, never guessed at. */
  function illegalIntents(s: GameState): Intent[] {
    const intents: Intent[] = [];
    // Play a card when it is not your turn (or outside a round).
    const notTheirTurn = s.players.find((p) => p.id !== s.currentTurn) ?? s.players[0]!;
    intents.push({ type: 'playCard', playerId: notTheirTurn.id, which: 0 });
    // Play a hand index that cannot exist.
    intents.push({ type: 'playCard', playerId: s.players[0]!.id, which: 2 as 0 | 1 });
    // Resolve a choice whose kind does not match the pending one — the kind
    // check runs first, so the target is never even considered.
    const pc = s.pendingChoice;
    const wrongKind: Intent = pc?.kind === 'guard'
      ? { type: 'choice', playerId: pc.playerId, choice: { kind: 'priest', targetPlayerId: pc.targets[0]! } }
      : { type: 'choice', playerId: pc?.playerId ?? s.players[0]!.id, choice: { kind: 'guard', targetPlayerId: s.players[0]!.id, namedRank: 2 } };
    intents.push(wrongKind);
    // Lifecycle intents in the wrong phase.
    if (s.phase !== 'roundEnded') intents.push({ type: 'nextRound', playerId: s.players[0]!.id });
    if (s.phase !== 'matchEnded') intents.push({ type: 'rematch', playerId: s.players[0]!.id });
    // Play a card while out of the round.
    const outOfRound = s.players.find((p) => p.out);
    if (outOfRound) intents.push({ type: 'playCard', playerId: outOfRound.id, which: 0 });
    return intents;
  }

  it('rejects illegal intents without throwing, leaving the state untouched', () => {
    for (const capacity of [2, 3, 4] as const) {
      for (let seed = 1; seed <= 25; seed++) {
        const rng = seededRng(seed * 1000 + capacity);
        let res = apply(null, {
          type: 'createRoom',
          roomCode: 'PUSH',
          capacity,
          playerId: 'A',
          playerName: 'Alice',
        }, rng);
        if (!res.ok) throw new Error(res.error);
        let state = res.state;
        for (let i = 0; i < capacity - 1; i++) {
          res = apply(state, { type: 'joinRoom', playerId: String.fromCharCode(66 + i), playerName: `P${i}` }, rng);
          if (!res.ok) throw new Error(res.error);
          state = res.state;
        }

        while (state.phase !== 'matchEnded') {
          // Every few transitions, hammer the state with illegal intents.
          for (const intent of illegalIntents(state)) {
            const before = structuredClone(state);
            const rejected = apply(state, intent, rng);
            expect(rejected.ok).toBe(false);
            expect(state).toEqual(before); // rejection never mutates the state
          }
          res = apply(state, randomIntent(state, rng), rng);
          if (!res.ok) throw new Error(`legal intent rejected: ${res.error}`);
          state = res.state;
        }
      }
    }
  });
});
