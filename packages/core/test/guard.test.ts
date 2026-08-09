import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import type { GameState } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p, seededRng } from './helpers.js';

const rng = seededRng(1);

/** A round where A (current turn) holds two Guards and B holds a Priest. */
function guardRound(): GameState {
  return makeGame([p('A', { hand: [card(1), card(1)] }), p('B', { hand: [card(2)] })], { deck: deckOf(5, 6, 7) });
}

describe('Guard: playing the card', () => {
  it('requires a follow-up choice naming a target and a card', () => {
    const result = apply(guardRound(), { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.pendingChoice).toMatchObject({
      kind: 'guard',
      playerId: 'A',
      targets: ['B'],
    });
    // Guard may never be named: options exclude rank 1
    expect(result.state.pendingChoice!.namedOptions).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(eventsOf(result.events, 'cardPlayed')[0]).toMatchObject({ playerId: 'A', card: card(1) });
    expect(eventsOf(result.events, 'choiceRequired')).toHaveLength(1);
  });

  it('moves the played card to the public discard pile', () => {
    const result = apply(guardRound(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    const a = result.state.players[0]!;
    expect(a.hand).toHaveLength(1);
    expect(a.discardPile).toEqual([card(1)]);
  });

  it('rejects playing out of turn', () => {
    const result = apply(guardRound(), { type: 'playCard', playerId: 'B', which: 0 });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects playing while a pending choice is open', () => {
    const s = guardRound();
    const first = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!first.ok) throw new Error(first.error);
    const result = apply(first.state, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects playing when out of the round', () => {
    const s = makeGame([p('A', { hand: [card(1), card(1)], out: true }), p('B')], { currentTurn: 'A' });
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects a bad hand index', () => {
    const result = apply(guardRound(), { type: 'playCard', playerId: 'A', which: 2 } as never);
    expect(result).toMatchObject({ ok: false });
  });
});

describe('Guard: resolving the guess', () => {
  it('correct guess eliminates the target and reveals their hand (2p ends the round)', () => {
    let result = apply(guardRound(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { targetPlayerId: 'B', namedRank: 2 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'handRevealed')).toEqual([{ type: 'handRevealed', playerId: 'B', card: card(2) }]);
    expect(eventsOf(result.events, 'playerEliminated')[0]).toMatchObject({ playerId: 'B', reason: 'guard' });
    const b = result.state.players[1]!;
    expect(b.out).toBe(true);
    expect(b.hand).toHaveLength(0);
    expect(b.discardPile).toContainEqual(card(2));
    // B was the only other player → last player standing ends the round
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['A'], reason: 'last-standing' });
    expect(result.state.players[0]!.tokens).toBe(1);
  });

  it('wrong guess changes nothing and passes the turn', () => {
    let result = apply(guardRound(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { targetPlayerId: 'B', namedRank: 8 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'handRevealed')).toHaveLength(0);
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
    const b = result.state.players[1]!;
    expect(b.out).toBe(false);
    expect(result.state.currentTurn).toBe('B');
    expect(eventsOf(result.events, 'turnStarted')[0]).toMatchObject({ playerId: 'B' });
  });

  it('rejects naming the Guard (Guard may never be named)', () => {
    let result = apply(guardRound(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { targetPlayerId: 'B', namedRank: 1 } });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects self-targeting (ruling 3)', () => {
    let result = apply(guardRound(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    // the pending choice never lists yourself as a legal target
    expect(result.state.pendingChoice!.targets).not.toContain('A');
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { targetPlayerId: 'A', namedRank: 2 } });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects a target that is not a legal option', () => {
    let result = apply(guardRound(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { targetPlayerId: 'NOPE', namedRank: 2 } });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects a choice when none is pending', () => {
    const result = apply(guardRound(), { type: 'choice', playerId: 'A', choice: { targetPlayerId: 'B', namedRank: 2 } });
    expect(result).toMatchObject({ ok: false });
  });

  it('rejects a choice made by someone else', () => {
    let result = apply(guardRound(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'B', choice: { targetPlayerId: 'A', namedRank: 2 } });
    expect(result).toMatchObject({ ok: false });
  });

  it('fizzles with no effect when every other player is protected', () => {
    const s = makeGame(
      [p('A', { hand: [card(1), card(1)] }), p('B', { hand: [card(2)], protected: true })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardFizzled')).toHaveLength(1);
    expect(result.state.pendingChoice).toBeNull();
    expect(result.state.currentTurn).toBe('B');
  });
});

describe('Guard in a 3-player round', () => {
  it('an elimination does not end the round, and the turn skips the out player', () => {
    const s = makeGame(
      [
        p('A', { hand: [card(1), card(1)] }),
        p('B', { hand: [card(2)] }),
        p('C', { hand: [card(6)] }),
      ],
      { deck: deckOf(5, 6, 7) },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { targetPlayerId: 'B', namedRank: 2 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'roundEnded')).toHaveLength(0);
    expect(result.state.phase).toBe('round');
    expect(result.state.currentTurn).toBe('C'); // B is out, so C is next
    expect(eventsOf(result.events, 'cardDrawn')[0]).toMatchObject({ playerId: 'C' });
  });
});
