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

  it('emits a private trade event per player with the card each received', () => {
    const s = makeGame(
      [p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5, 7, 8) },
    );
    const result = playKingTrading(s, 'B');
    if (!result.ok) throw new Error(result.error);
    expect(eventsOf(result.events, 'handTraded')).toEqual([
      { type: 'handTraded', playerId: 'A', card: card(2) },
      { type: 'handTraded', playerId: 'B', card: card(1) },
    ]);
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
