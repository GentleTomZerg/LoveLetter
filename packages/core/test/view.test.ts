import { describe, expect, it } from 'vitest';
import { buildView, reduceView } from '../src/index.js';
import type { PendingChoice, ViewState } from '../src/index.js';
import { card, makeGame, p } from './helpers.js';

const SELF = 'A';
const OTHER = 'B';

describe('buildView', () => {
  it('includes only the viewer’s own hand and public player info', () => {
    const state = makeGame([
      p('A', { name: 'Alice', hand: [card(1)], tokens: 2, discardPile: [card(3)] }),
      p('B', { name: 'Bob', hand: [card(8)], out: true, discardPile: [card(2)] }),
    ]);
    const view = buildView(state, SELF);
    expect(view.hand).toEqual([card(1)]);
    expect(view.players[0]).toMatchObject({ id: 'A', name: 'Alice', tokens: 2, out: false });
    expect(view.players[1]).toMatchObject({ id: 'B', name: 'Bob', tokens: 0, out: true });
    // the other player's hand is never part of my view
    expect(Object.keys(view.players[1]!)).not.toContain('hand');
    expect(view.players[1]!.discardPile).toEqual([card(2)]);
    expect(view.currentTurn).toBe('A');
  });
});

describe('reduceView: a full Guard-only round from A’s perspective', () => {
  it('rebuilds hand, discard piles, pending choice, log, and phase', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), SELF);

    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [card(1), card(3), card(5)] }, SELF);
    expect(view!.phase).toBe('round');
    expect(view!.deckCount).toBe(10);
    expect(view!.faceUpRemoved).toHaveLength(3);

    view = reduceView(view, { type: 'cardDealt', playerId: SELF, card: card(1) }, SELF);
    view = reduceView(view, { type: 'cardDealt', playerId: OTHER, card: card(2) }, SELF);
    expect(view!.hand).toEqual([card(1)]); // other players' deals never touch my hand

    view = reduceView(view, { type: 'turnStarted', playerId: SELF }, SELF);
    view = reduceView(view, { type: 'cardDrawn', playerId: SELF, card: card(1) }, SELF);
    expect(view!.hand).toEqual([card(1), card(1)]);
    expect(view!.deckCount).toBe(9); // every draw decrements the deck count

    // draws by other players also shrink the deck, but their card stays hidden
    view = reduceView(view, { type: 'cardDrawn', playerId: OTHER, card: null }, SELF);
    expect(view!.deckCount).toBe(8);
    expect(view!.hand).toEqual([card(1), card(1)]);

    view = reduceView(view, { type: 'cardPlayed', playerId: SELF, which: 0, card: card(1) }, SELF);
    expect(view!.hand).toEqual([card(1)]);
    expect(view!.players[0]!.discardPile).toEqual([card(1)]);

    const pending: PendingChoice = { kind: 'guard', playerId: SELF, targets: [OTHER], namedOptions: [2, 3, 4, 5, 6, 7, 8] };
    view = reduceView(view, { type: 'choiceRequired', playerId: SELF, pendingChoice: pending }, SELF);
    expect(view!.pendingChoice).toEqual(pending);

    view = reduceView(view, { type: 'choiceMade', playerId: SELF, choice: { targetPlayerId: OTHER, namedRank: 2 } }, SELF);
    expect(view!.pendingChoice).toBeNull();

    view = reduceView(view, { type: 'handRevealed', playerId: OTHER, card: card(2) }, SELF);
    view = reduceView(view, { type: 'playerEliminated', playerId: OTHER, reason: 'guard' }, SELF);
    expect(view!.players[1]!.out).toBe(true);
    expect(view!.players[1]!.discardPile).toEqual([card(2)]);

    view = reduceView(view, { type: 'roundEnded', winnerIds: [SELF], reason: 'last-standing' }, SELF);
    expect(view!.phase).toBe('roundEnded');
    expect(view!.roundWinnerIds).toEqual([SELF]);
    expect(view!.currentTurn).toBeNull();
    expect(view!.players[0]!.tokens).toBe(1); // the round winner's token

    view = reduceView(view, { type: 'matchEnded', winnerId: SELF }, SELF);
    expect(view!.phase).toBe('matchEnded');
    expect(view!.matchWinnerId).toBe(SELF);

    const kinds = view!.log.map((e) => e.kind);
    expect(kinds).toContain('play');
    expect(kinds).toContain('choice');
    expect(kinds).toContain('reveal');
    expect(kinds).toContain('eliminate');
    expect(kinds).toContain('round');
    expect(kinds).toContain('match');
    expect(view!.log.map((e) => e.text)).toContain('You played Guard');
    expect(view!.log.map((e) => e.text)).toContain('You guessed Bob has Priest');
  });

  it('renders the other player’s perspective with names, not "You"', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), OTHER);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, OTHER);
    view = reduceView(view, { type: 'cardPlayed', playerId: 'A', which: 0, card: card(1) }, OTHER);
    expect(view!.log.map((e) => e.text)).toContain('Alice played Guard');
  });

  it('rematchStarted resets tokens and the scoreboard', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { tokens: 5 }), p('B', { tokens: 2 })]), SELF);
    view = reduceView(view, { type: 'rematchStarted' }, SELF);
    expect(view!.players.every((p) => p.tokens === 0)).toBe(true);
    expect(view!.roundNumber).toBe(0);
    expect(view!.matchWinnerId).toBeNull();
  });

  it('returns null when there is no view yet (events before snapshot)', () => {
    expect(reduceView(null, { type: 'turnStarted', playerId: 'A' }, SELF)).toBeNull();
  });
});
