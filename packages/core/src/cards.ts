/**
 * The 16-card deck and card metadata (rules spec §1).
 *
 * Deck composition is data, not hard-coded per card, so an extended deck is a
 * config change (DESIGN Q2).
 */

import type { Card, CardName, Rank } from './types.js';

/** Display + rules text per rank. Effect text mirrors the official rulebook. */
export const CARD_INFO: Record<Rank, { name: CardName; effect: string }> = {
  1: { name: 'Guard', effect: 'Choose a player and name a card (other than Guard). If that player has that card, they are out of the round.' },
  2: { name: 'Priest', effect: 'Look at one other player\'s hand — you alone.' },
  3: { name: 'Baron', effect: 'Secretly compare hands with another player. Lower rank is out; a tie changes nothing.' },
  4: { name: 'Handmaid', effect: 'You are immune to other players\' cards until the start of your next turn.' },
  5: { name: 'Prince', effect: 'Choose a player (including yourself). They discard their hand and draw a new card.' },
  6: { name: 'King', effect: 'Trade hands with another player. A trade is not a discard.' },
  7: { name: 'Countess', effect: 'No effect when discarded. If you hold her with the King or Prince, you must discard her.' },
  8: { name: 'Princess', effect: 'If you discard the Princess for any reason, you are out of the round.' },
};

const DECK_COMPOSITION: ReadonlyArray<{ rank: Rank; count: number }> = [
  { rank: 1, count: 5 }, // Guard ×5
  { rank: 2, count: 2 }, // Priest ×2
  { rank: 3, count: 2 }, // Baron ×2
  { rank: 4, count: 2 }, // Handmaid ×2
  { rank: 5, count: 2 }, // Prince ×2
  { rank: 6, count: 1 }, // King ×1
  { rank: 7, count: 1 }, // Countess ×1
  { rank: 8, count: 1 }, // Princess ×1
];

/**
 * How many copies of each rank are in the deck, derived from the composition
 * (ticket 39). DECK_COMPOSITION stays the single source of deck truth — an
 * extended deck updates both buildDeck() and the manual's counts.
 */
export const CARD_COUNTS: Record<Rank, number> = Object.fromEntries(
  DECK_COMPOSITION.map(({ rank, count }) => [rank, count]),
) as Record<Rank, number>;

/** The full 16-card deck, in composition order (caller shuffles). */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const { rank, count } of DECK_COMPOSITION) {
    for (let i = 0; i < count; i++) deck.push(cardOf(rank));
  }
  return deck;
}

/** A single card of the given rank. */
export function cardOf(rank: Rank): Card {
  return { rank, name: CARD_INFO[rank].name };
}

/** Ranks involved in the Countess rule (§4.7): she must go when a royal joins her. */
const COUNTESS_RANK: Rank = 7;
const KING_RANK: Rank = 6;
const PRINCE_RANK: Rank = 5;

/**
 * The card that must be discarded immediately when the hand pairs the Countess
 * with the King or Prince (rules spec §4.7). The engine enforces the discard
 * at every hand change (draws, the King trade, the Prince's target), so a
 * consistent view never holds the pair — the check is a defensive guard that
 * rejects an illegal hand before any card resolves.
 */
export function forcedDiscard(hand: readonly Card[]): Rank | null {
  const has = (rank: Rank) => hand.some((c) => c.rank === rank);
  return has(COUNTESS_RANK) && (has(KING_RANK) || has(PRINCE_RANK)) ? COUNTESS_RANK : null;
}
