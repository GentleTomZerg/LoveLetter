/**
 * Card-moment derivation (ticket 22) — the pure seam under the play
 * animations. Each new log entry is mapped to at most one animation moment
 * (fly / flash / banner) or none; informational lines and the replayed
 * history never animate. Seats never fly — only cards move.
 *
 * The engine's resolution entries (`baron`/`prince`/`king`/`peek`) carry no
 * card rank, so a small fact cache remembers the last card each player
 * played (public information) to give the fly its art. This is a fact
 * cache, not moment correlation — the ADR-0003 "one event, one entry"
 * rule is untouched.
 */

import type { LogEntry, Rank } from '@love-letter/core';

export interface MomentState {
  /** The last card each player played (public) — art for resolution flies. */
  lastPlayed: Record<string, Rank>;
}

export type Moment =
  /** A card leaves a player's seat and lands on the target's seat (or pile). */
  | { key: string; kind: 'fly'; rank: Rank; from: string; to: string; toPile: boolean }
  /** A revealed card flashes at its owner's seat. */
  | { key: string; kind: 'flash'; rank: Rank; at: string }
  /** Round/match outcome — a short centered banner that fades. */
  | { key: string; kind: 'banner'; text: string };

export const initialMomentState = (): MomentState => ({ lastPlayed: {} });

/** Ranks whose play resolves against a target (Guard/Priest/Baron/Prince/King). */
const TARGETING = new Set<Rank>([1, 2, 3, 5, 6]);

/**
 * Map one fresh log entry to its moments (zero or one) and the next state.
 * `fmt` localizes banner text (round/match lines); it is only called for
 * banner entries.
 */
export function momentsFor(entry: LogEntry, state: MomentState, fmt: (entry: LogEntry) => string): {
  state: MomentState;
  moments: Moment[];
} {
  const { params } = entry;
  const key = `e${entry.id}`;
  const playerId = params.playerId as string | undefined;
  const rank = params.rank as Rank | undefined;
  const lastPlayed = state.lastPlayed[playerId ?? ''];

  switch (entry.kind) {
    case 'play': {
      // Remember the played card; only non-targeting plays fly to the pile
      // here — targeting plays resolve in their `guard`/`baron`/… entry.
      const next: MomentState = rank !== undefined ? { ...state, lastPlayed: { ...state.lastPlayed, [playerId!]: rank } } : state;
      if (rank !== undefined && !TARGETING.has(rank) && playerId !== undefined) {
        return { state: next, moments: [{ key, kind: 'fly', rank, from: playerId, to: playerId, toPile: true }] };
      }
      return { state: next, moments: [] };
    }

    case 'fizzle':
      // The card had no legal target — it lands in the player's pile.
      if (rank !== undefined && playerId !== undefined) {
        return {
          state: { ...state, lastPlayed: { ...state.lastPlayed, [playerId]: rank } },
          moments: [{ key, kind: 'fly', rank, from: playerId, to: playerId, toPile: true }],
        };
      }
      return { state, moments: [] };

    case 'guard':
      // The accusation flies the guessed card at the target.
      if (rank !== undefined && playerId !== undefined && params.targetId !== undefined) {
        return {
          state,
          moments: [{ key, kind: 'fly', rank, from: playerId, to: String(params.targetId), toPile: false }],
        };
      }
      return { state, moments: [] };

    case 'baron':
    case 'prince':
    case 'king':
    case 'peek':
      // The resolution flies the played card (from the fact cache) at the
      // target — the peeked card itself stays private.
      if (lastPlayed !== undefined && playerId !== undefined && params.targetId !== undefined) {
        return {
          state,
          moments: [{ key, kind: 'fly', rank: lastPlayed, from: playerId, to: String(params.targetId), toPile: false }],
        };
      }
      return { state, moments: [] };

    case 'discard':
      // Prince target or forced Countess — the card lands in that player's pile.
      if (rank !== undefined && playerId !== undefined) {
        return { state, moments: [{ key, kind: 'fly', rank, from: playerId, to: playerId, toPile: true }] };
      }
      return { state, moments: [] };

    case 'reveal':
      if (rank !== undefined && playerId !== undefined) {
        return { state, moments: [{ key, kind: 'flash', rank, at: playerId }] };
      }
      return { state, moments: [] };

    case 'round':
    case 'match':
      return { state, moments: [{ key, kind: 'banner', text: fmt(entry) }] };

    // eliminate dims the seat via the existing out-state transition;
    // choice/join/leave/info/… are text-only.
    default:
      return { state, moments: [] };
  }
}
