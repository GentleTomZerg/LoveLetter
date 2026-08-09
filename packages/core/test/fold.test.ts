/**
 * Auto-fold (ticket 05, DESIGN Q12): the server folds a dropped player when
 * their turn comes and their grace window has expired. The engine treats the
 * fold as a system-issued intent — same validation, one new outcome: out of
 * the round with the hand revealed, seat kept for the next round.
 */

import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p, seededRng } from './helpers.js';

/** A round where A (current turn, 2 cards) faces B and C. */
function threePlayerRound(deck: ReturnType<typeof deckOf> = deckOf(5, 6, 7)) {
  return makeGame(
    [p('A', { hand: [card(1), card(2)] }), p('B', { hand: [card(3)] }), p('C', { hand: [card(4)] })],
    { deck },
  );
}

/** A two-player round: A (current turn, 2 cards) against B. */
function twoPlayerRound(deck: ReturnType<typeof deckOf> = deckOf(4, 5, 6)) {
  return makeGame([p('A', { hand: [card(1), card(2)] }), p('B', { hand: [card(3)] })], { deck });
}

function fold(state: ReturnType<typeof makeGame>, playerId: string) {
  return apply(state, { type: 'fold', playerId });
}

describe('fold (server-issued on a dropped socket)', () => {
  it('eliminates the turn owner, reveals their hand, and passes the turn on', () => {
    const result = fold(threePlayerRound(), 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(eventsOf(result.events, 'playerEliminated')[0]).toMatchObject({ playerId: 'A', reason: 'fold' });
    expect(eventsOf(result.events, 'handRevealed').map((e) => e.card)).toEqual([card(1), card(2)]);
    const a = result.state.players[0]!;
    expect(a.out).toBe(true);
    expect(a.hand).toEqual([]);
    expect(a.discardPile).toEqual([card(1), card(2)]);

    // The turn passes to the next player in round, who draws as usual.
    expect(result.state.currentTurn).toBe('B');
    expect(result.state.players[1]!.hand).toEqual([card(3), card(5)]);
    expect(eventsOf(result.events, 'turnStarted')[0]).toMatchObject({ playerId: 'B' });
    expect(result.state.pendingChoice).toBeNull();
    expect(eventsOf(result.events, 'roundEnded')).toHaveLength(0);
  });

  it('ends the round by last-standing when only one other player remains', () => {
    const result = fold(twoPlayerRound(), 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('roundEnded');
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['B'], reason: 'last-standing' });
    expect(result.state.players[1]!.tokens).toBe(1);
  });

  it('ends the round by highest hand when the deck is empty', () => {
    const result = fold(threePlayerRound(deckOf()), 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['C'], reason: 'highest-hand' });
    expect(result.state.players[2]!.tokens).toBe(1);
  });

  it('abandons the folded player’s open pending choice', () => {
    const s = threePlayerRound();
    s.pendingChoice = { kind: 'guard', playerId: 'A', targets: ['B', 'C'], namedOptions: [2, 3, 4, 5, 6, 7, 8] };
    const result = fold(s, 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'choiceAbandoned')[0]).toMatchObject({ playerId: 'A' });
    expect(result.state.pendingChoice).toBeNull();
    expect(result.state.currentTurn).toBe('B');
  });

  it('does not emit choiceAbandoned when no choice is open', () => {
    const result = fold(threePlayerRound(), 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'choiceAbandoned')).toHaveLength(0);
  });

  it('rejects folding a player who is not the turn owner', () => {
    expect(fold(threePlayerRound(), 'B')).toMatchObject({ ok: false });
  });

  it('rejects folding outside a round', () => {
    const s = makeGame([p('A'), p('B')], { phase: 'roundEnded', currentTurn: null });
    expect(fold(s, 'A')).toMatchObject({ ok: false });
  });

  it('rejects folding a player already out of the round', () => {
    const s = makeGame([p('A', { hand: [], out: true }), p('B', { hand: [card(3)] })], { currentTurn: 'A' });
    expect(fold(s, 'A')).toMatchObject({ ok: false });
  });

  it('refuses to fold the last player in the round (the room would have nobody)', () => {
    const s = makeGame(
      [p('A', { hand: [card(1), card(2)] }), p('B', { hand: [], out: true })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = fold(s, 'A');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/last player/);
  });

  it('keeps the folded player’s seat for the next round', () => {
    const s = twoPlayerRound();
    let result = fold(s, 'A');
    if (!result.ok) throw new Error(result.error);
    expect(result.state.phase).toBe('roundEnded');
    expect(result.state.players[1]!.tokens).toBe(1);

    result = apply(result.state, { type: 'nextRound', playerId: 'B' }, seededRng(1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('round');
    expect(result.state.roundNumber).toBe(2);
    expect(result.state.players.map((p) => p.id)).toEqual(['A', 'B']);
    expect(result.state.players[0]).toMatchObject({ out: false, tokens: 0 });
  });
});
