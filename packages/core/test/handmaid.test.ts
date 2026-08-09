import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p } from './helpers.js';

describe('Handmaid (4)', () => {
  it('protects the player until the start of their next turn', () => {
    // A plays the Handmaid; B's Guard then has no legal target (A is
    // protected), and when A's next turn starts the immunity has ended.
    const s = makeGame(
      [p('A', { hand: [card(4), card(1)] }), p('B', { hand: [card(1), card(2)] })],
      { deck: deckOf(5, 6, 7) },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players[0]!.protected).toBe(true);

    // B's turn: A cannot be chosen by the Guard → fizzle.
    result = apply(result.state, { type: 'playCard', playerId: 'B', which: 0 });
    if (!result.ok) throw new Error(result.error);
    expect(eventsOf(result.events, 'cardFizzled')).toHaveLength(1);

    // A's next turn starts → immunity over.
    expect(result.state.currentTurn).toBe('A');
    expect(result.state.players[0]!.protected).toBe(false);
    expect(eventsOf(result.events, 'turnStarted')[0]).toMatchObject({ playerId: 'A' });
  });

  it('does not block your own Prince (self-targeting stays legal)', () => {
    const s = makeGame(
      [p('A', { hand: [card(5), card(1)] }), p('B', { hand: [card(2)], protected: true })],
      { deck: deckOf(6, 7, 8) },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    // B is protected, so the only legal Prince target is A themselves.
    expect(result.state.pendingChoice).toMatchObject({ kind: 'prince', targets: ['A'] });
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'prince', targetPlayerId: 'A' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDiscarded')).toHaveLength(1);
  });

  it('cannot be chosen by the King either', () => {
    const s = makeGame(
      [p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(2)], protected: true })],
      { deck: deckOf(5, 7, 8) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardFizzled')).toHaveLength(1);
  });
});
