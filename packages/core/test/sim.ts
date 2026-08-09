/**
 * Random-play simulation driver (ticket 04): plays one full match with random
 * legal intents and asserts engine invariants after every transition.
 *
 * `runMatch` throws (never returns a failure) if the engine rejects a legal
 * intent, deadlocks, violates an invariant, or ends a match illegally — so a
 * stress run is a single call per match. All randomness flows through a seeded
 * PRNG (`seededRng`), keeping runs deterministic.
 *
 * Invariants checked after every `apply`:
 *  - hands never exceed 2 cards; eliminated players hold none
 *  - the 16 cards are always conserved (deck + burned + face-up removals +
 *    every hand + every discard pile), with the exact rank composition
 *  - face-up removals exist only in 2-player rounds, and exactly 3 of them
 *  - during a round: the turn owner is in the round and never protected; a
 *    pending choice belongs to the turn owner and lists every legal target
 *    (in-round, other players, and never protected — except the Prince's
 *    self-target); a Guard's named options are every rank but the Guard's
 *  - Protection always expires by the start of the protected player's turn
 *    (checked against `turnStarted` events)
 */

import { apply, buildDeck } from '../src/index.js';
import type { Card, Event, GameState, Intent, PendingChoice, Rank } from '../src/index.js';
import { seededRng } from './helpers.js';

export { seededRng } from './helpers.js';

/** The exact 16-card composition, keyed by rank. */
const EXPECTED_COMPOSITION = new Map<number, number>();
for (const c of buildDeck()) {
  EXPECTED_COMPOSITION.set(c.rank, (EXPECTED_COMPOSITION.get(c.rank) ?? 0) + 1);
}

/** A Guard may name any rank except the Guard itself (rules spec §4.1). */
const GUARD_NAMED_OPTIONS: Rank[] = [2, 3, 4, 5, 6, 7, 8];

/** A deterministic uniform pick from a non-empty list. */
function pick<T>(items: readonly T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

function allCards(s: GameState): Card[] {
  return [
    ...s.deck,
    ...(s.burned ? [s.burned] : []),
    ...s.faceUpRemoved,
    ...s.players.flatMap((p) => [...p.hand, ...p.discardPile]),
  ];
}

/** The targets a pending choice of this kind must list, per the rules. */
function expectedTargets(s: GameState, pc: PendingChoice): string[] {
  return s.players
    .filter((p) =>
      !p.out && (pc.kind === 'prince'
        ? p.id === pc.playerId || !p.protected
        : p.id !== pc.playerId && !p.protected))
    .map((p) => p.id);
}

/** Order-insensitive member equality (no duplicates expected). */
function sameMembers<T extends string | number>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',');
}

/**
 * Assert every engine invariant on a state. Throws with a descriptive message
 * on the first violation. `events` (the latest transition's) lets us verify
 * that a `turnStarted` player is never still protected.
 */
export function assertInvariants(s: GameState, events: readonly Event[]): void {
  if (s.phase === 'lobby') return; // no cards dealt yet, nothing to check

  for (const p of s.players) {
    if (p.hand.length > 2) throw new Error(`hand > 2 cards: ${p.id} holds ${p.hand.length}`);
    if (p.out && p.hand.length !== 0) throw new Error(`eliminated player ${p.id} still holds ${p.hand.length} card(s)`);
  }

  if (s.phase === 'round') {
    const actor = s.currentTurn ? s.players.find((p) => p.id === s.currentTurn) : undefined;
    if (s.currentTurn !== null && (!actor || actor.out)) {
      throw new Error(`turn belongs to a player out of the round: ${s.currentTurn}`);
    }
    if (actor && actor.protected) throw new Error(`turn owner ${actor.id} is protected`);
    const pc = s.pendingChoice;
    if (pc !== null) {
      if (pc.playerId !== s.currentTurn) throw new Error('pending choice does not belong to the turn owner');
      const owner = s.players.find((p) => p.id === pc.playerId);
      if (!owner || owner.out) throw new Error('pending choice belongs to a player out of the round');
      // The choice lists every legal target — a missing target would silently
      // starve the driver of a legal move, so exhaustiveness is an invariant
      // (rules spec §4.1, §5; Protected blocks choosers except self-Prince).
      if (!sameMembers(pc.targets, expectedTargets(s, pc))) {
        throw new Error(`pending ${pc.kind} targets are not exhaustive: got [${pc.targets}], expected [${expectedTargets(s, pc)}]`);
      }
      // The Guard may name any card except the Guard itself (§4.1).
      if (pc.kind === 'guard' && !sameMembers(pc.namedOptions, GUARD_NAMED_OPTIONS)) {
        throw new Error(`Guard named options are not exhaustive: got [${pc.namedOptions}]`);
      }
    }
  }

  // Protection expires at the start of the protected player's turn.
  for (const e of events) {
    if (e.type === 'turnStarted' && e.playerId !== undefined) {
      const p = s.players.find((x) => x.id === e.playerId);
      if (p && p.protected) throw new Error(`protection not cleared at ${p.id}'s turn start`);
    }
  }

  // Card conservation: all 16 cards, in the exact deck composition.
  const cards = allCards(s);
  if (cards.length !== 16) throw new Error(`card conservation: ${cards.length} of 16 cards in play`);
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  for (const [rank, n] of EXPECTED_COMPOSITION) {
    if (counts.get(rank) !== n) {
      throw new Error(`card conservation: rank ${rank} appears ${counts.get(rank)} times, expected ${n}`);
    }
  }

  // Setup counts per player count (rules spec §2): exactly 3 face-up removals
  // in 2-player rounds, none otherwise.
  if (s.capacity === 2) {
    if (s.faceUpRemoved.length !== 3) throw new Error(`2-player round removed ${s.faceUpRemoved.length} face-up cards, expected 3`);
  } else if (s.faceUpRemoved.length !== 0) {
    throw new Error(`${s.capacity}-player round has ${s.faceUpRemoved.length} face-up removals`);
  }
}

/** The next intent a random-but-honest player would send. */
export function randomIntent(s: GameState, rng: () => number): Intent {
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
  const which = actor.hand.length > 1 && rng() < 0.5 ? 1 : 0;
  return { type: 'playCard', playerId: s.currentTurn!, which };
}

export interface SimSummary {
  /** The final state — always `matchEnded`. */
  state: GameState;
  /** Transitions (applies) used, including the lobby setup. */
  steps: number;
  /** Number of rounds played. */
  rounds: number;
  /** Reasons the rounds ended, one per round. */
  roundEndReasons: Array<'last-standing' | 'highest-hand'>;
  /** Ranks that were played or discarded across the match. */
  ranksResolved: Set<number>;
}

/** A match that takes more transitions than this is deadlocked. */
export const MAX_STEPS = 500;


/**
 * Play one full match of `capacity` players with random legal moves, starting
 * from an empty room. Throws on any violation (see `assertInvariants`), any
 * rejected legal intent, or failure to terminate within `MAX_STEPS`.
 */
export function runMatch(seed: number, capacity: 2 | 3 | 4): SimSummary {
  const rng = seededRng(seed);

  let roundsStarted = 0;
  const roundEndReasons: Array<'last-standing' | 'highest-hand'> = [];
  const ranksResolved = new Set<number>();
  const observe = (events: readonly Event[]) => {
    for (const e of events) {
      if (e.type === 'roundStarted') roundsStarted += 1;
      else if (e.type === 'roundEnded') roundEndReasons.push(e.reason);
      else if (e.type === 'cardPlayed' || e.type === 'cardDiscarded') ranksResolved.add(e.card.rank);
    }
  };

  // Open the room and fill it; the last join auto-starts the first round
  // (its roundStarted event is counted too).
  let res = apply(null, {
    type: 'createRoom',
    roomCode: 'SIMO',
    capacity,
    playerId: 'A',
    playerName: 'Alice',
  }, rng);
  if (!res.ok) throw new Error(`createRoom failed: ${res.error}`);
  let state = res.state;
  observe(res.events);
  let steps = 1;
  const names = ['Bob', 'Carol', 'Dave'];
  for (let i = 0; i < capacity - 1; i++) {
    res = apply(state, { type: 'joinRoom', playerId: String.fromCharCode(66 + i), playerName: names[i]! }, rng);
    if (!res.ok) throw new Error(`joinRoom failed: ${res.error}`);
    state = res.state;
    observe(res.events);
    steps += 1;
  }

  while (state.phase !== 'matchEnded') {
    const intent = randomIntent(state, rng);
    res = apply(state, intent, rng);
    if (!res.ok) throw new Error(`legal intent rejected: ${JSON.stringify(intent)} → ${res.error}`);
    state = res.state;
    assertInvariants(state, res.events);
    observe(res.events);
    steps += 1;
    if (steps > MAX_STEPS) throw new Error(`match did not terminate after ${MAX_STEPS} steps`);
  }

  assertInvariants(state, []);
  if (roundsStarted !== roundEndReasons.length) {
    throw new Error(`roundStarted (${roundsStarted}) ≠ roundEnded (${roundEndReasons.length})`);
  }
  const winner = state.players.find((p) => p.id === state.matchWinnerId)!;
  if (winner.tokens !== state.tokenTarget) {
    throw new Error(`match winner has ${winner.tokens} tokens, target is ${state.tokenTarget}`);
  }
  return { state, steps, rounds: roundEndReasons.length, roundEndReasons, ranksResolved };
}
