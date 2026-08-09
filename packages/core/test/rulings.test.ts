/**
 * The four adopted rulings (ADR-0001) as named tests — the canonical record
 * that each one is implemented. The per-card suites cover the surrounding
 * mechanics; these pin the rulings themselves.
 */

import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p } from './helpers.js';

describe('Adopted rulings (ADR-0001)', () => {
  it('ruling 1 — full tie at round end: all tied players get a token', () => {
    // A plays a Guard this turn (discard total 2+1=3), matching B's 3.
    const s = makeGame(
      [
        p('A', { hand: [card(1), card(1)], discardPile: [card(2)] }),
        p('B', { hand: [card(1)], discardPile: [card(3)] }),
      ],
      { deck: [] },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'guard', targetPlayerId: 'B', namedRank: 8 } });
    if (!result.ok) throw new Error(result.error);
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['A', 'B'] });
    expect(result.state.players[0]!.tokens).toBe(1);
    expect(result.state.players[1]!.tokens).toBe(1);
  });

  it('ruling 2 — Countess after a King trade: discard immediately', () => {
    // Hand-built edge state: B holds the Countess and the King (a pair that
    // the engine's at-draw enforcement prevents from ever forming naturally).
    // A plays the King, B receives A's remaining card — the pair moves to A,
    // who must discard the Countess immediately after the trade.
    const s = makeGame(
      [p('A', { hand: [card(6), card(1)] }), p('B', { hand: [card(7), card(6)] })],
      { deck: deckOf(2, 3, 4) },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'king', targetPlayerId: 'B' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDiscarded')[0]).toMatchObject({ playerId: 'A', card: card(7), reason: 'countess' });
    expect(result.state.players[0]!.hand).toEqual([card(6)]);
    expect(result.state.players[0]!.discardPile).toContainEqual(card(7));
  });

  it('ruling 3 — Guard self-targeting is disallowed', () => {
    const s = makeGame([p('A', { hand: [card(1), card(1)] }), p('B', { hand: [card(2)] })], { deck: deckOf(5, 6, 7) });
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.pendingChoice!.targets).not.toContain('A');
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'guard', targetPlayerId: 'A', namedRank: 2 } });
    expect(result).toMatchObject({ ok: false });
  });

  it('ruling 4 — 2-player Prince empty-deck draw uses the face-down burned card', () => {
    const s = makeGame(
      [p('A', { hand: [card(5), card(1)] }), p('B', { hand: [card(2)] })],
      { deck: [], burned: card(3), faceUpRemoved: [card(5), card(6), card(7)] },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'prince', targetPlayerId: 'B' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDrawn')[0]).toMatchObject({ playerId: 'B', card: card(3) });
    expect(result.state.burned).toBeNull();
    expect(result.state.faceUpRemoved).toHaveLength(3); // never drawn
  });
});
