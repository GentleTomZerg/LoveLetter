import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p } from './helpers.js';

describe('Countess (7)', () => {
  it('must be discarded immediately when drawn alongside the King', () => {
    // A holds the Countess; B plays the Handmaid (no choice), so the turn
    // passes to A, who draws the King — the pair forces her discard at once,
    // in the same apply, before A ever gets to play.
    const s = makeGame(
      [p('A', { hand: [card(7)] }), p('B', { hand: [card(4), card(1)] })],
      { currentTurn: 'B', deck: deckOf(6, 8) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'B', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDrawn')[0]).toMatchObject({ playerId: 'A', card: card(6) });
    expect(eventsOf(result.events, 'cardDiscarded')[0]).toMatchObject({
      playerId: 'A',
      card: card(7),
      reason: 'countess',
    });
    expect(result.state.players[0]!.hand).toEqual([card(6)]);
    expect(result.state.players[0]!.discardPile).toEqual([card(7)]);
  });

  it('does not force a discard when held with the Princess', () => {
    // A's turn-start draw gives the Princess: Countess + Princess forces nothing.
    const s = makeGame(
      [p('A', { hand: [card(7)] }), p('B', { hand: [card(4), card(1)] })],
      { currentTurn: 'B', deck: deckOf(8) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'B', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDiscarded')).toHaveLength(0);
    expect(result.state.players[0]!.hand).toEqual([card(7), card(8)]);
  });

  it('is not blocked by Handmaid protection', () => {
    const s = makeGame(
      [p('A', { hand: [card(7)], protected: true }), p('B', { hand: [card(4), card(1)] })],
      { currentTurn: 'B', deck: deckOf(6, 8) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'B', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDiscarded')[0]).toMatchObject({ reason: 'countess' });
  });

  it('can be discarded voluntarily and has no effect', () => {
    const s = makeGame(
      [p('A', { hand: [card(7), card(2)] }), p('B', { hand: [card(8)] })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardPlayed')[0]).toMatchObject({ playerId: 'A', card: card(7) });
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
    expect(eventsOf(result.events, 'choiceRequired')).toHaveLength(0);
    expect(result.state.currentTurn).toBe('B');
  });

  it('rejects playing the King or Prince while still holding her (defensive)', () => {
    const s = makeGame(
      [p('A', { hand: [card(7), card(6)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5, 8, 7) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 1 });
    expect(result).toMatchObject({ ok: false });
  });
});
