import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p } from './helpers.js';

function playKingTrading(s: ReturnType<typeof makeGame>, target: string) {
  let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
  if (!result.ok) throw new Error(result.error);
  return apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'king', targetPlayerId: target } });
}

describe('King (6)', () => {
  it('swaps hands with the target', () => {
    const s = makeGame(
      [p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5, 7, 8) },
    );
    const result = playKingTrading(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0]!.hand).toEqual([card(2)]);
    // the turn passes to B, who draws the deck's top card
    expect(result.state.players[1]!.hand).toEqual([card(1), card(5)]);
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
  });

  it('emits a private trade event per player with the cards each received and the public hand size', () => {
    const s = makeGame(
      [p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5, 7, 8) },
    );
    const result = playKingTrading(s, 'B');
    if (!result.ok) throw new Error(result.error);
    expect(eventsOf(result.events, 'handTraded')).toEqual([
      { type: 'handTraded', playerId: 'A', cards: [card(2)], count: 1 }, // A played the King, so both hands are one card
      { type: 'handTraded', playerId: 'B', cards: [card(1)], count: 1 },
    ]);
  });

  it('carries the full received hand when the trade is unequal', () => {
    // Constructed: the target holds two cards (unreachable in the current
    // deck, but the engine supports the state — the payload must be honest
    // for any future extended deck, per DESIGN Q2).
    const s = makeGame(
      [p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(2), card(4)] })],
      { deck: deckOf(5, 7, 8) },
    );
    const result = playKingTrading(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'handTraded')).toEqual([
      { type: 'handTraded', playerId: 'A', cards: [card(2), card(4)], count: 2 },
      { type: 'handTraded', playerId: 'B', cards: [card(1)], count: 1 },
    ]);
  });

  it('hands over an empty hand when the King player has nothing left to give', () => {
    // A's Countess was already forced (holding the King), so A plays the
    // King with a single card and gives the target nothing.
    const s = makeGame(
      [p('A', { hand: [card(6)] }), p('B', { hand: [card(2), card(4)] })],
      { deck: deckOf(5, 7, 8) },
    );
    const result = playKingTrading(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'handTraded')).toEqual([
      { type: 'handTraded', playerId: 'A', cards: [card(2), card(4)], count: 2 },
      { type: 'handTraded', playerId: 'B', cards: [], count: 0 },
    ]);
    expect(result.state.players[0]!.hand).toEqual([card(2), card(4)]);
    expect(result.state.players[1]!.hand).toEqual([card(5)]); // empty hand, then the draw
  });

  it('copies the received hand — a later play cannot rewrite the logged event', () => {
    const s = makeGame(
      [p('A', { hand: [card(6), card(4)] }), p('B', { hand: [card(2), card(4)] })],
      { deck: deckOf(5, 7, 8) },
    );
    let result = playKingTrading(s, 'B');
    if (!result.ok) throw new Error(result.error);
    const traded = eventsOf(result.events, 'handTraded');
    expect(traded[0]!).toEqual({ type: 'handTraded', playerId: 'A', cards: [card(2), card(4)], count: 2 });
    // B plays the Handmaid (no choice), then A — A's play splices the state
    // hand the event references; the logged event's copy must stay intact.
    result = apply(result.state, { type: 'playCard', playerId: 'B', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    expect(traded[0]!.cards).toEqual([card(2), card(4)]);
  });

  it('forces the Countess discard when a King trade hands her the Prince (ruling 2)', () => {
    // Defensive: in standard play the King's target always holds one card, so
    // a trade can never create the pair — but if a state ever reached it, the
    // discard must fire at the trade, not the next decision (ADR-0001).
    const s = makeGame(
      [p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(7), card(5)] })],
      { deck: deckOf(2, 8) },
    );
    const result = playKingTrading(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDiscarded')).toEqual([
      { type: 'cardDiscarded', playerId: 'A', card: card(7), reason: 'countess' },
    ]);
    expect(result.state.players[0]!.hand).toEqual([card(5)]);
    expect(result.state.players[0]!.discardPile).toEqual([card(6), card(7)]); // played King, then the forced Countess
    expect(result.state.players[1]!.hand).toEqual([card(1), card(2)]); // Guard received, then the draw
  });

  it('trading the Princess is legal — a trade is not a discard', () => {
    const s = makeGame(
      [p('A', { hand: [card(6), card(8)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5, 7, 8) },
    );
    const result = playKingTrading(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0]!.hand).toEqual([card(2)]);
    expect(result.state.players[1]!.hand).toEqual([card(8), card(5)]); // B draws after the trade
    expect(result.state.players[0]!.out).toBe(false);
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
  });

  it('cannot trade with a protected player — all protected → does nothing', () => {
    const s = makeGame(
      [p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(2)], protected: true })],
      { deck: deckOf(5, 7, 8) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardFizzled')).toHaveLength(1);
    expect(result.state.players[0]!.hand).toEqual([card(1)]);
    expect(result.state.players[1]!.hand).toEqual([card(2), card(5)]); // B draws on their turn
  });

  it('cannot trade with an out player', () => {
    const s = makeGame(
      [p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(2)], out: true })],
      { deck: deckOf(5, 7, 8) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardFizzled')).toHaveLength(1);
  });

  it('rejects an illegal target', () => {
    let result = apply(
      makeGame([p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(2)] })]),
      { type: 'playCard', playerId: 'A', which: 0 },
    );
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'king', targetPlayerId: 'NOPE' } });
    expect(result).toMatchObject({ ok: false });
  });
});
