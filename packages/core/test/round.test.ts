import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import type { ApplyResult, Event, GameState } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p } from './helpers.js';

/**
 * Play A's Guard then resolve the guess, driving the round to its end.
 * `choice` of rank 8 (Princess) never matches the targets used here.
 */
function playGuardAndMiss(s: GameState): { ok: true; state: GameState; events: Event[] } {
  let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
  if (!result.ok) throw new Error(result.error);
  result = apply(result.state, { type: 'choice', playerId: 'A', choice: { targetPlayerId: result.state.pendingChoice!.targets[0]!, namedRank: 8 } });
  if (!result.ok) throw new Error(result.error);
  return result;
}

describe('round end: deck empty at the end of a turn (rules spec §6)', () => {
  it('the highest remaining hand wins', () => {
    // A drew two Guards and played one; B holds a Priest; the deck is empty.
    const s = makeGame(
      [p('A', { hand: [card(1), card(1)] }), p('B', { hand: [card(2)] })],
      { deck: [] },
    );
    const result = playGuardAndMiss(s);
    const ended = eventsOf(result.events, 'roundEnded')[0]!;
    expect(ended).toMatchObject({ winnerIds: ['B'], reason: 'highest-hand' });
    // both in-round hands are revealed publicly
    expect(eventsOf(result.events, 'handRevealed')).toHaveLength(2);
    expect(result.state.players[1]!.tokens).toBe(1);
    expect(result.state.phase).toBe('roundEnded');
  });

  it('a tie is broken by the higher total of discarded values', () => {
    const s = makeGame(
      [
        p('A', { hand: [card(1), card(1)], discardPile: [card(3)] }),
        p('B', { hand: [card(2)] }),
      ],
      { deck: [] },
    );
    const result = playGuardAndMiss(s);
    // A holds Guard (1) after playing, B holds Priest (2): B wins on hand.
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['B'] });
  });

  it('tie-break: equal hands compare discard totals', () => {
    const s = makeGame(
      [
        p('A', { hand: [card(1), card(1)], discardPile: [card(3)] }),
        p('B', { hand: [card(1)], discardPile: [card(2)] }),
      ],
      { deck: [] },
    );
    const result = playGuardAndMiss(s);
    // Both hold Guard (1); A discarded Baron (3) > B's Priest (2) → A wins.
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['A'] });
  });

  it('a full tie awards a token to every tied player (ruling 1)', () => {
    // A plays a Guard this turn, so A's total discarded becomes 2 + 1 = 3;
    // B's discard total of 3 (Baron) matches it — a full tie.
    const s = makeGame(
      [
        p('A', { hand: [card(1), card(1)], discardPile: [card(2)] }),
        p('B', { hand: [card(1)], discardPile: [card(3)] }),
      ],
      { deck: [] },
    );
    const result = playGuardAndMiss(s);
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['A', 'B'], reason: 'highest-hand' });
    expect(result.state.players[0]!.tokens).toBe(1);
    expect(result.state.players[1]!.tokens).toBe(1);
  });

  it('a hand-built deck with cards still in it does not end the round', () => {
    const s = makeGame(
      [p('A', { hand: [card(1), card(1)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5) },
    );
    const result = playGuardAndMiss(s);
    expect(eventsOf(result.events, 'roundEnded')).toHaveLength(0);
    expect(result.state.phase).toBe('round');
    expect(result.state.currentTurn).toBe('B');
  });
});

describe('round end: last player standing', () => {
  it('a correct Guard guess in a 2-player round ends it immediately', () => {
    const s = makeGame([p('A', { hand: [card(1), card(1)] }), p('B', { hand: [card(2)] })], { deck: deckOf(5, 6, 7) });
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { targetPlayerId: 'B', namedRank: 2 } });
    if (!result.ok) throw new Error(result.error);
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['A'], reason: 'last-standing' });
    expect(result.state.phase).toBe('roundEnded');
  });
});

describe('roundEnded phase and nextRound', () => {
  it('nextRound deals a new round with the previous winner going first', () => {
    let result = apply(
      makeGame([p('A', { hand: [card(1), card(1)] }), p('B', { hand: [card(2)] })]),
      { type: 'playCard', playerId: 'A', which: 0 },
    );
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { targetPlayerId: 'B', namedRank: 2 } });
    if (!result.ok) throw new Error(result.error);
    const round1 = result.state;
    expect(round1.phase).toBe('roundEnded');
    expect(round1.players[0]!.tokens).toBe(1);

    const rng = (() => { let seed = 5; return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; })();
    result = apply(round1, { type: 'nextRound', playerId: 'A' }, rng);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const s = result.state;
    expect(s.roundNumber).toBe(2);
    expect(s.phase).toBe('round');
    expect(s.currentTurn).toBe('A'); // previous winner goes first
    expect(s.players[0]!.hand).toHaveLength(2); // first player drew
    expect(s.players[1]!.hand).toHaveLength(1);
    expect(s.players[0]!.tokens).toBe(1); // tokens persist across rounds
    expect(eventsOf(result.events, 'roundStarted')[0]).toMatchObject({ roundNumber: 2 });
  });

  it('rejects nextRound when no round is waiting', () => {
    const result = apply(makeGame([p('A'), p('B')]), { type: 'nextRound', playerId: 'A' });
    expect(result).toMatchObject({ ok: false });
  });

  it('a new round starts with the previous round winner even after a full tie', () => {
    const s = makeGame(
      [
        p('A', { hand: [card(1), card(1)], discardPile: [card(2)] }),
        p('B', { hand: [card(1)], discardPile: [card(3)] }),
      ],
      { deck: [] },
    );
    let result: ApplyResult = playGuardAndMiss(s);
    expect(result.state.roundWinnerIds).toEqual(['A', 'B']);
    result = apply(result.state, { type: 'nextRound', playerId: 'A' }, () => 0.1);
    if (!result.ok) throw new Error(result.error);
    expect(result.state.currentTurn).toBe('A');
  });
});
