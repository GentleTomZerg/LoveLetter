import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p } from './helpers.js';

describe('Princess (8)', () => {
  it('discarding her eliminates you, no matter how or why', () => {
    const s = makeGame(
      [p('A', { hand: [card(8), card(1)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'playerEliminated')[0]).toMatchObject({ playerId: 'A', reason: 'princess' });
    expect(result.state.players[0]!.out).toBe(true);
    // the remaining hand card is revealed face-up (out-of-round rule)
    expect(eventsOf(result.events, 'handRevealed')).toEqual([{ type: 'handRevealed', playerId: 'A', card: card(1) }]);
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['B'], reason: 'last-standing' });
  });

  it('trading her away with the King does not eliminate you (a trade is not a discard)', () => {
    const s = makeGame(
      [p('A', { hand: [card(6), card(8)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5, 7, 8) },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'king', targetPlayerId: 'B' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0]!.out).toBe(false);
    expect(result.state.players[1]!.hand).toEqual([card(8), card(5)]); // B draws after the trade
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
  });

  it('Prince’d Princess eliminates the holder without a replacement draw', () => {
    const s = makeGame(
      [p('A', { hand: [card(5), card(1)] }), p('B', { hand: [card(8)] })],
      { deck: deckOf(6, 7, 8) },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'prince', targetPlayerId: 'B' } });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.players[1]!.out).toBe(true);
    expect(eventsOf(result.events, 'cardDrawn')).toHaveLength(0);
  });
});
