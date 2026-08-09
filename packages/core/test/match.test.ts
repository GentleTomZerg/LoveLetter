import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, eventsOf, guardChoice, makeGame, p, seededRng } from './helpers.js';

/** A match configured to end after a single round win. */
function nearTargetGame() {
  return makeGame(
    [p('A', { hand: [card(1), card(1)] }), p('B', { hand: [card(2)] })],
    { tokenTarget: 1, deck: [] },
  );
}

describe('match end', () => {
  it('defaults to 7 tokens for two players', () => {
    const result = apply(null, { type: 'createRoom', roomCode: 'TEST', capacity: 2, playerId: 'A', playerName: 'Alice' });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.tokenTarget).toBe(7);
  });

  it('ends the match when a player reaches the token target', () => {
    let result = apply(nearTargetGame(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: guardChoice('B', 2) });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.phase).toBe('matchEnded');
    expect(result.state.matchWinnerId).toBe('A');
    expect(result.state.players[0]!.tokens).toBe(1);
    expect(eventsOf(result.events, 'roundEnded')).toHaveLength(1);
    expect(eventsOf(result.events, 'matchEnded')[0]).toMatchObject({ winnerId: 'A' });
  });

  it('a full tie at the target awards tokens but names one match winner (ADR-0002)', () => {
    const s = makeGame(
      [
        p('A', { hand: [card(1), card(1)], discardPile: [card(2)] }),
        p('B', { hand: [card(1)], discardPile: [card(3)] }),
      ],
      { tokenTarget: 1, deck: [] },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: guardChoice('B', 8) });
    if (!result.ok) throw new Error(result.error);
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['A', 'B'] });
    expect(result.state.players.every((p) => p.tokens === 1)).toBe(true);
    expect(result.state.matchWinnerId).toBe('A'); // first winner in seat order
    expect(eventsOf(result.events, 'matchEnded')).toHaveLength(1);
  });
});

describe('rematch', () => {
  it('starts a fresh match with the same seats, tokens reset', () => {
    const rng = seededRng(3);
    let result = apply(nearTargetGame(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: guardChoice('B', 2) });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.phase).toBe('matchEnded');

    result = apply(result.state, { type: 'rematch', playerId: 'B' }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'rematchStarted')).toHaveLength(1);
    expect(result.state.phase).toBe('round');
    expect(result.state.roundNumber).toBe(1);
    expect(result.state.matchWinnerId).toBeNull();
    expect(result.state.players.map((p) => p.id)).toEqual(['A', 'B']); // same seats
    expect(result.state.players.every((p) => p.tokens === 0)).toBe(true);
    expect(result.state.players.every((p) => !p.out)).toBe(true);
    expect(result.state.players[0]!.hand).toHaveLength(2); // first player drew
    expect(result.state.players[1]!.hand).toHaveLength(1);
    expect(eventsOf(result.events, 'roundStarted')[0]).toMatchObject({ roundNumber: 1 });
  });

  it('rejects rematch before the match is over', () => {
    const result = apply(makeGame([p('A'), p('B')]), { type: 'rematch', playerId: 'A' });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects nextRound once the match has ended', () => {
    let result = apply(nearTargetGame(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: guardChoice('B', 2) });
    if (!result.ok) throw new Error(result.error);
    const done = apply(result.state, { type: 'nextRound', playerId: 'A' });
    expect(done).toMatchObject({ ok: false });
  });
});
