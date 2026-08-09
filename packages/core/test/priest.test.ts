import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p } from './helpers.js';

/** A round where A (current turn) holds two Priests and B holds the Princess. */
function priestRound() {
  return makeGame(
    [p('A', { hand: [card(2), card(2)] }), p('B', { hand: [card(8)] })],
    { deck: deckOf(5, 6, 7) },
  );
}

describe('Priest (2)', () => {
  it('asks for a target and reveals it to the chooser only', () => {
    let result = apply(priestRound(), { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingChoice).toMatchObject({ kind: 'priest', playerId: 'A', targets: ['B'] });

    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'priest', targetPlayerId: 'B' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const peek = eventsOf(result.events, 'handPeeked')[0]!;
    expect(peek).toEqual({ type: 'handPeeked', playerId: 'A', targetPlayerId: 'B', card: card(8) });
    // the peek changes nothing else: no elimination, and B keeps their card
    // (plus the card they draw when their turn comes)
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
    expect(result.state.players[1]!.hand).toEqual([card(8), card(5)]);
    expect(eventsOf(result.events, 'turnStarted')[0]).toMatchObject({ playerId: 'B' });
  });

  it('fizzles when every other player is protected', () => {
    const s = makeGame(
      [p('A', { hand: [card(2), card(2)] }), p('B', { hand: [card(8)], protected: true })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardFizzled')).toHaveLength(1);
    expect(result.state.pendingChoice).toBeNull();
  });

  it('rejects an illegal target and a mismatched choice kind', () => {
    let result = apply(priestRound(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    const badTarget = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'priest', targetPlayerId: 'NOPE' } });
    expect(badTarget).toMatchObject({ ok: false });
    const badKind = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'guard', targetPlayerId: 'B', namedRank: 2 } });
    expect(badKind).toMatchObject({ ok: false });
  });
});
