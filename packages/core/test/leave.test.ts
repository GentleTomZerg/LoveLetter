/**
 * Intentional leave (issue 11): a player quits for good. Unlike `fold`, the
 * seat is removed, not held — the lobby can refill, and a 3–4 player match
 * continues with fewer seats. The engine rejects leaving a match that would
 * drop below two players (the server tears that room down instead), and
 * always rejects leaving a seat the player does not hold.
 */

import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, makeLobby, p, seededRng } from './helpers.js';

/** A 3-player round: A (current turn, 2 cards) against B and C. */
function threePlayerRound(deck: ReturnType<typeof deckOf> = deckOf(5, 6, 7)) {
  return makeGame(
    [p('A', { hand: [card(1), card(2)] }), p('B', { hand: [card(3)] }), p('C', { hand: [card(4)] })],
    { deck },
  );
}

function leave(state: ReturnType<typeof makeGame>, playerId: string) {
  return apply(state, { type: 'leave', playerId });
}

describe('leave from the lobby', () => {
  it('removes the seat so the room can refill', () => {
    const s = makeLobby(3, ['A', 'B']);
    const result = leave(s, 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.players.map((p) => p.id)).toEqual(['B']);
    expect(result.state.phase).toBe('lobby');
    expect(eventsOf(result.events, 'playerLeft')[0]).toMatchObject({ playerId: 'A', name: 'A' });

    // The freed seat can be filled again (lobby join still works).
    const refill = apply(result.state, { type: 'joinRoom', playerId: 'C', playerName: 'Carol' });
    expect(refill.ok).toBe(true);
    if (!refill.ok) return;
    expect(refill.state.players.map((p) => p.id)).toEqual(['B', 'C']);
  });

  it('lets the last player leave the lobby (the room is then empty)', () => {
    const result = leave(makeLobby(2, ['A']), 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players).toHaveLength(0);
  });
});

describe('leave from a round (3+ players)', () => {
  it('reveals the leaver’s hand, emits playerLeft, and keeps the others seated', () => {
    const result = leave(threePlayerRound(), 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(eventsOf(result.events, 'handRevealed').map((e) => e.card)).toEqual([card(1), card(2)]);
    expect(eventsOf(result.events, 'playerLeft')[0]).toMatchObject({ playerId: 'A', name: 'A' });
    expect(result.state.players.map((p) => p.id)).toEqual(['B', 'C']);
    // no elimination: the seat is gone, not out of the round
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
  });

  it('advances the turn to the next in-round seat when the leaver held it', () => {
    const result = leave(threePlayerRound(), 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'turnStarted')[0]).toMatchObject({ playerId: 'B' });
    expect(result.state.currentTurn).toBe('B');
    // the next player draws as usual
    expect(result.state.players[0]!.hand).toEqual([card(3), card(5)]);
    expect(eventsOf(result.events, 'cardDrawn')[0]).toMatchObject({ playerId: 'B', card: card(5) });
    expect(result.state.pendingChoice).toBeNull();
    expect(eventsOf(result.events, 'roundEnded')).toHaveLength(0);
  });

  it('passes the turn to the seat after the leaver, not the first seat', () => {
    const s = makeGame(
      [p('A', { hand: [card(1), card(2)] }), p('B', { hand: [card(3)] }), p('C', { hand: [card(4)] })],
      { deck: deckOf(5, 6, 7), currentTurn: 'B' },
    );
    const result = leave(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.currentTurn).toBe('C');
    expect(result.state.players.map((p) => p.id)).toEqual(['A', 'C']);
    expect(result.state.players[1]!.hand).toEqual([card(4), card(5)]);
  });

  it('leaves the turn untouched when the leaver is not the turn owner', () => {
    const result = leave(threePlayerRound(), 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.currentTurn).toBe('A');
    expect(eventsOf(result.events, 'turnStarted')).toHaveLength(0);
    expect(eventsOf(result.events, 'roundEnded')).toHaveLength(0);
  });

  it('abandons the leaver’s open pending choice', () => {
    const s = threePlayerRound();
    s.pendingChoice = { kind: 'guard', playerId: 'A', targets: ['B', 'C'], namedOptions: [2, 3, 4, 5, 6, 7, 8] };
    const result = leave(s, 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'choiceAbandoned')[0]).toMatchObject({ playerId: 'A' });
    expect(result.state.pendingChoice).toBeNull();
    expect(result.state.currentTurn).toBe('B');
  });

  it('ends the round by last-standing when the leaver leaves one other in-round player', () => {
    const s = makeGame(
      [p('A', { hand: [card(1), card(2)] }), p('B', { hand: [card(3)] }), p('C', { hand: [], out: true })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = leave(s, 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('roundEnded');
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['B'], reason: 'last-standing' });
    expect(result.state.players[0]!.tokens).toBe(1);
  });

  it('ends the round by highest hand when the deck is empty', () => {
    const s = makeGame(
      [p('A', { hand: [card(1), card(2)] }), p('B', { hand: [card(3)] }), p('C', { hand: [card(4)] })],
      { deck: deckOf() },
    );
    const result = leave(s, 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('roundEnded');
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['C'], reason: 'highest-hand' });
    expect(result.state.players[1]!.tokens).toBe(1);
  });

  it('removes an already-eliminated leaver without revealing cards or touching the round', () => {
    const s = makeGame(
      [p('A', { hand: [card(1), card(2)] }), p('B', { hand: [card(3)] }), p('C', { hand: [], out: true })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = leave(s, 'C');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.map((p) => p.id)).toEqual(['A', 'B']);
    expect(eventsOf(result.events, 'handRevealed')).toHaveLength(0);
    expect(result.state.currentTurn).toBe('A');
    expect(eventsOf(result.events, 'roundEnded')).toHaveLength(0);
  });

  it('rejects leaving a 2-player match (the server tears the room down instead)', () => {
    const s = makeGame([p('A', { hand: [card(1), card(2)] }), p('B', { hand: [card(3)] })], { deck: deckOf(4, 5, 6) });
    const result = leave(s, 'A');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('room_needs_two');
  });
});

describe('leave at roundEnded and matchEnded', () => {
  it('removes the player between rounds', () => {
    const s = makeGame([p('A'), p('B'), p('C')], { phase: 'roundEnded', currentTurn: null });
    const result = leave(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.map((p) => p.id)).toEqual(['A', 'C']);
    expect(eventsOf(result.events, 'playerLeft')[0]).toMatchObject({ playerId: 'B' });
    expect(eventsOf(result.events, 'handRevealed')).toHaveLength(0);
  });

  it('clears the winner list when the round winner leaves at roundEnded, so the next round starts on a live seat', () => {
    const s = makeGame([p('A'), p('B'), p('C')], { phase: 'roundEnded', currentTurn: null, roundWinnerIds: ['A'] });
    const result = leave(s, 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.roundWinnerIds).toEqual([]);
    const next = apply(result.state, { type: 'nextRound', playerId: 'B' }, seededRng(1));
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.state.currentTurn).toBe('B'); // first remaining seat, not a ghost
    expect(next.state.players.map((p) => p.id)).toEqual(['B', 'C']);
  });

  it('removes the player at match end', () => {
    const s = makeGame([p('A', { tokens: 7 }), p('B', { tokens: 3 }), p('C', { tokens: 1 })], {
      phase: 'matchEnded',
      matchWinnerId: 'A',
      currentTurn: null,
    });
    const result = leave(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.players.map((p) => p.id)).toEqual(['A', 'C']);
    expect(result.state.matchWinnerId).toBe('A');
  });

  it('rejects leaving when a 2-player match is already over', () => {
    const s = makeGame([p('A', { tokens: 7 }), p('B', { tokens: 3 })], {
      phase: 'matchEnded',
      matchWinnerId: 'A',
      currentTurn: null,
    });
    expect(leave(s, 'B')).toMatchObject({ ok: false });
  });
});

describe('leave validation', () => {
  it('rejects leaving a seat the player does not hold', () => {
    expect(leave(threePlayerRound(), 'X')).toMatchObject({ ok: false });
  });
});
