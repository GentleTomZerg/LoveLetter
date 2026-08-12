import { describe, expect, it } from 'vitest';
import { buildView, reduceView } from '../src/index.js';
import type { Event as GameEvent, PendingChoice, ViewState } from '../src/index.js';
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
    expect(view.players[0]).toMatchObject({ id: 'A', name: 'Alice', tokens: 2, out: false, handCount: 1 });
    expect(view.players[1]).toMatchObject({ id: 'B', name: 'Bob', tokens: 0, out: true, handCount: 1 });
    // the other player's hand is never part of my view
    expect(Object.keys(view.players[1]!)).not.toContain('hand');
    expect(view.players[1]!.discardPile).toEqual([card(2)]);
    expect(view.currentTurn).toBe('A');
    // the roster maps every player id to a name for log rendering (ADR-0003)
    expect(view.roster).toEqual({ A: 'Alice', B: 'Bob' });
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

    view = reduceView(view, { type: 'choiceMade', playerId: SELF, choice: { kind: 'guard', targetPlayerId: OTHER, namedRank: 2 } }, SELF);
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
    // structured entries carry ids and ranks, never display text (ADR-0003)
    expect(view!.log).toContainEqual({ kind: 'play', params: { playerId: 'A', rank: 1 }, id: expect.any(Number) });
    expect(view!.log).toContainEqual({ kind: 'guard', params: { playerId: 'A', targetId: 'B', rank: 2 }, id: expect.any(Number) });
  });

  it('renders the other player’s perspective with names, not "You"', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), OTHER);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, OTHER);
    view = reduceView(view, { type: 'cardPlayed', playerId: 'A', which: 0, card: card(1) }, OTHER);
    expect(view!.log).toContainEqual({ kind: 'play', params: { playerId: 'A', rank: 1 }, id: expect.any(Number) });
  });

  it('rematchStarted resets tokens and the scoreboard', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { tokens: 5 }), p('B', { tokens: 2 })]), SELF);
    view = reduceView(view, { type: 'rematchStarted' }, SELF);
    expect(view!.players.every((p) => p.tokens === 0)).toBe(true);
    expect(view!.roundNumber).toBe(0);
    expect(view!.matchWinnerId).toBeNull();
  });

  it('logs the new card events from the other player’s perspective', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, SELF);

    view = reduceView(view, { type: 'choiceMade', playerId: SELF, choice: { kind: 'prince', targetPlayerId: OTHER } }, SELF);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'prince', params: { playerId: 'A', targetId: 'B' } });

    view = reduceView(view, { type: 'choiceMade', playerId: SELF, choice: { kind: 'prince', targetPlayerId: SELF } }, SELF);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'prince', params: { playerId: 'A', targetId: 'A' } });

    view = reduceView(view, { type: 'choiceMade', playerId: SELF, choice: { kind: 'baron', targetPlayerId: OTHER } }, SELF);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'baron', params: { playerId: 'A', targetId: 'B' } });

    view = reduceView(view, { type: 'choiceMade', playerId: SELF, choice: { kind: 'king', targetPlayerId: OTHER } }, SELF);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'king', params: { playerId: 'A', targetId: 'B' } });

    view = reduceView(view, { type: 'cardDiscarded', playerId: OTHER, card: card(7), reason: 'countess' }, SELF);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'discard', params: { playerId: 'B', rank: 7, reason: 'countess' } });
    expect(view!.players[1]!.discardPile).toContainEqual(card(7));

    view = reduceView(view, { type: 'cardDiscarded', playerId: OTHER, card: card(2), reason: 'prince' }, SELF);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'discard', params: { playerId: 'B', rank: 2, reason: 'prince' } });

    // the Priest peek: with the card for the chooser (self)…
    view = reduceView(view, { type: 'handPeeked', playerId: SELF, targetPlayerId: OTHER, card: card(8) }, SELF);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'peek', params: { playerId: 'A', targetId: 'B', rank: 8 } });
    // …and without the card for everyone else
    view = reduceView(view, { type: 'handPeeked', playerId: OTHER, targetPlayerId: SELF, card: null }, OTHER);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'peek', params: { playerId: 'B', targetId: 'A' } });
  });

  it('keeps the viewer’s own hand in sync when cards leave it', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, SELF);
    view = reduceView(view, { type: 'cardDealt', playerId: SELF, card: card(7) }, SELF);
    view = reduceView(view, { type: 'cardDrawn', playerId: SELF, card: card(6) }, SELF);
    expect(view!.hand).toEqual([card(7), card(6)]);

    // forced Countess discard removes her from the hand
    view = reduceView(view, { type: 'cardDiscarded', playerId: SELF, card: card(7), reason: 'countess' }, SELF);
    expect(view!.hand).toEqual([card(6)]);

    // a Prince'd discard removes the discarded card, keeping the rest
    view = reduceView(view, { type: 'cardDiscarded', playerId: SELF, card: card(6), reason: 'prince' }, SELF);
    expect(view!.hand).toEqual([]);

    // a King trade replaces the whole hand with the received cards
    view = reduceView(view, { type: 'handTraded', playerId: SELF, cards: [card(3)], count: 1 }, SELF);
    expect(view!.hand).toEqual([card(3)]);
    // …but a trade by someone else never touches my hand (the cards stay private)
    view = reduceView(view, { type: 'handTraded', playerId: OTHER, cards: null, count: 2 }, SELF);
    expect(view!.hand).toEqual([card(3)]);

    // elimination reveals drop the revealed card from my hand
    view = reduceView(view, { type: 'cardDealt', playerId: SELF, card: card(8) }, SELF);
    view = reduceView(view, { type: 'cardDrawn', playerId: SELF, card: card(1) }, SELF);
    view = reduceView(view, { type: 'handRevealed', playerId: SELF, card: card(1) }, SELF);
    expect(view!.hand).toEqual([card(8)]);
  });

  it('returns null when there is no view yet (events before snapshot)', () => {
    expect(reduceView(null, { type: 'turnStarted', playerId: 'A' }, SELF)).toBeNull();
  });

  it('an empty-handed King trade drops the received-empty hand from the view (ticket 30)', () => {
    // The reported bug: A plays the King against a Prince'd player on an
    // empty deck, who holds zero cards. A receives an empty hand — the old
    // `if (event.card)` guard skipped the replacement, leaving A's old card
    // in the view; the client then clicked a card the server no longer held
    // ("no card on that position").
    let view: ViewState | null = buildView(makeGame([p('A'), p('B')], { deck: [] }), SELF);
    view = reduceView(view, { type: 'cardPlayed', playerId: 'A', which: 0, card: card(6) }, SELF);
    view = reduceView(view, { type: 'choiceMade', playerId: 'A', choice: { kind: 'king', targetPlayerId: 'B' } }, SELF);
    view = reduceView(view, { type: 'handTraded', playerId: 'A', cards: [], count: 0 }, SELF);
    view = reduceView(view, { type: 'handTraded', playerId: 'B', cards: [card(3)], count: 1 }, SELF);
    // The empty received hand replaces the view hand — no stale card survives.
    expect(view!.hand).toEqual([]);
    expect(view!.players.find((x) => x.id === SELF)!.handCount).toBe(0);

    // The turn passes to B, who draws; A's view stays empty and in lockstep.
    view = reduceView(view, { type: 'turnStarted', playerId: 'B' }, SELF);
    view = reduceView(view, { type: 'cardDrawn', playerId: 'B', card: card(5) }, SELF);
    expect(view!.hand).toEqual([]);
    expect(view!.players.find((x) => x.id === SELF)!.handCount).toBe(0);
  });

  it('tracks every player’s public hand count through a full round (issue 13)', () => {
    let view: ViewState | null = buildView(makeGame([p('A'), p('B')], { deck: [] }), SELF);
    const round: GameEvent = { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 8, faceUpRemoved: [] };

    // Round start: nobody holds cards until the deals arrive.
    view = reduceView(view, round, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([0, 0]);

    // Each player is dealt exactly one card.
    view = reduceView(view, { type: 'cardDealt', playerId: 'A', card: card(1) }, SELF);
    view = reduceView(view, { type: 'cardDealt', playerId: 'B', card: card(2) }, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([1, 1]);

    // A's turn: plays one, then draws one back.
    view = reduceView(view, { type: 'cardDrawn', playerId: 'A', card: card(1) }, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([2, 1]);
    view = reduceView(view, { type: 'cardPlayed', playerId: 'A', which: 0, card: card(1) }, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([1, 1]);

    // Prince'd discard drops B to zero.
    view = reduceView(view, { type: 'cardDiscarded', playerId: 'B', card: card(2), reason: 'prince' }, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([1, 0]);

    // A King trade swaps unequal hands: A (1) ↔ B (0). The count travels
    // with the received hand, so B's trade event carries the new size.
    view = reduceView(view, { type: 'handTraded', playerId: 'A', cards: null, count: 0 }, SELF);
    view = reduceView(view, { type: 'handTraded', playerId: 'B', cards: [card(1)], count: 1 }, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([0, 1]);

    // B draws back to two, then is eliminated: the reveal drops them to zero.
    view = reduceView(view, { type: 'cardDrawn', playerId: 'B', card: card(1) }, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([0, 2]);
    view = reduceView(view, { type: 'handRevealed', playerId: 'B', card: card(1) }, SELF);
    view = reduceView(view, { type: 'handRevealed', playerId: 'B', card: card(2) }, SELF);
    view = reduceView(view, { type: 'playerEliminated', playerId: 'B', reason: 'guard' }, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([0, 0]);
    expect(view!.players[1]!.discardPile).toHaveLength(3); // played + Prince'd + both revealed

    // Rematch resets the counts.
    view = reduceView(view, { type: 'rematchStarted' }, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([0, 0]);
  });

  it('the empty-deck burn draw still lands in the drawing player’s hand', () => {
    let view: ViewState | null = buildView(makeGame([p('A'), p('B')], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 0, faceUpRemoved: [] }, SELF);
    view = reduceView(view, { type: 'cardDealt', playerId: 'A', card: card(1) }, SELF);
    view = reduceView(view, { type: 'cardDealt', playerId: 'B', card: card(2) }, SELF);
    expect(view!.players.map((p) => p.handCount)).toEqual([1, 1]);
    // Deck empty: A's next draw is the face-down burned card (ruling 4).
    view = reduceView(view, { type: 'cardDrawn', playerId: 'A', card: null }, SELF);
    expect(view!.burnedCount).toBe(0);
    expect(view!.players.map((p) => p.handCount)).toEqual([2, 1]);
  });
});

describe('reduceView: playerLeft (issue 11)', () => {
  it('removes the leaver’s row and logs the leave', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' }), p('C', { name: 'Carol' })], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, SELF);
    view = reduceView(view, { type: 'playerLeft', playerId: 'B', name: 'Bob' }, SELF);
    expect(view!.players.map((p) => p.id)).toEqual(['A', 'C']);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'leave', params: { playerId: 'B' } });
    // the leaver's name stays resolvable through the roster
    expect(view!.roster['B']).toBe('Bob');
  });

  it('stays consistent when the leaver held the turn and the turn passes on', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' }), p('C', { name: 'Carol' })], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, SELF);
    view = reduceView(view, { type: 'cardDealt', playerId: 'B', card: card(3) }, SELF);
    // A leaves on her own turn; the batch resolves the turn before the row
    // leaves, so the view never points at a removed player.
    view = reduceView(view, { type: 'handRevealed', playerId: 'A', card: card(1) }, SELF);
    view = reduceView(view, { type: 'handRevealed', playerId: 'A', card: card(2) }, SELF);
    view = reduceView(view, { type: 'turnStarted', playerId: 'B' }, SELF);
    expect(view!.currentTurn).toBe('B');
    view = reduceView(view, { type: 'cardDrawn', playerId: 'B', card: card(5) }, SELF);
    expect(view!.players.find((p) => p.id === 'B')!.handCount).toBe(2);
    view = reduceView(view, { type: 'playerLeft', playerId: 'A', name: 'Alice' }, SELF);
    expect(view!.currentTurn).toBe('B');
    expect(view!.players.find((p) => p.id === 'A')).toBeUndefined();
  });

  it('clears a leaving round winner from the winner list', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' }), p('C', { name: 'Carol' })], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, SELF);
    view = reduceView(view, { type: 'roundEnded', winnerIds: ['A'], reason: 'last-standing' }, SELF);
    expect(view!.roundWinnerIds).toEqual(['A']);
    view = reduceView(view, { type: 'playerLeft', playerId: 'A', name: 'Alice' }, SELF);
    expect(view!.roundWinnerIds).toEqual([]);
    expect(view!.players.map((p) => p.id)).toEqual(['B', 'C']);
  });
});

describe('reduceView: public table state from events (replay fidelity)', () => {
  it('a round always starts with one face-down burned card', () => {
    let view: ViewState | null = buildView(makeGame([p('A'), p('B')], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, SELF);
    expect(view!.burnedCount).toBe(1);
  });

  it('the burned card leaves the burn pile only on an empty-deck draw (ruling 4)', () => {
    let view: ViewState | null = buildView(makeGame([p('A'), p('B')], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, SELF);

    // The deck empties through ordinary draws; the burn pile is untouched.
    for (let i = 0; i < 10; i++) {
      view = reduceView(view, { type: 'cardDrawn', playerId: 'A', card: null }, SELF);
    }
    expect(view!.deckCount).toBe(0);
    expect(view!.burnedCount).toBe(1); // taking the last deck card is not a burn draw

    // A further draw with the deck empty is the face-down burned card.
    view = reduceView(view, { type: 'cardDrawn', playerId: 'B', card: null }, SELF);
    expect(view!.burnedCount).toBe(0);
  });

  it('the Handmaid protects the player until their next turn starts', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), OTHER);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, OTHER);
    expect(view!.players[0]!.protected).toBe(false);

    view = reduceView(view, { type: 'cardPlayed', playerId: 'A', which: 0, card: card(4) }, OTHER);
    expect(view!.players[0]!.protected).toBe(true); // Handmaid immunity is public

    view = reduceView(view, { type: 'turnStarted', playerId: 'A' }, OTHER);
    expect(view!.players[0]!.protected).toBe(false); // expires at the start of your turn
  });

  it('folds the choiceAbandoned event by clearing the pending choice', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), OTHER);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, OTHER);
    const pending: PendingChoice = { kind: 'guard', playerId: 'A', targets: ['B'], namedOptions: [2, 3, 4, 5, 6, 7, 8] };
    view = reduceView(view, { type: 'choiceRequired', playerId: 'A', pendingChoice: pending }, OTHER);
    expect(view!.pendingChoice).toEqual(pending);
    view = reduceView(view, { type: 'choiceAbandoned', playerId: 'A' }, OTHER);
    expect(view!.pendingChoice).toBeNull();
    expect(view!.log.at(-1)).toMatchObject({ kind: 'info', params: { what: 'choiceAbandoned', playerId: 'A' } });
  });

  it('labels a fold elimination in the log', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), OTHER);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, OTHER);
    view = reduceView(view, { type: 'playerEliminated', playerId: 'A', reason: 'fold' }, OTHER);
    expect(view!.log.at(-1)).toMatchObject({ kind: 'eliminate', params: { playerId: 'A', reason: 'fold' } });
  });
});

describe('reduceView: resolution completion events (ticket 26)', () => {
  it('maps guardMissed to a miss entry carrying the guess and the played card', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, SELF);
    view = reduceView(view, { type: 'cardDealt', playerId: OTHER, card: card(2) }, SELF);
    view = reduceView(view, { type: 'guardMissed', playerId: 'A', targetId: 'B', guessRank: 8, rank: 1 }, SELF);
    // rank = the guessed card (same semantics as the guard marker entry),
    // played = the played Guard — the miss line names both (ADR-0003 params).
    expect(view!.log.at(-1)).toMatchObject({
      kind: 'miss',
      params: { playerId: 'A', targetId: 'B', rank: 8, played: 1 },
    });
    // Nothing else changed — a miss reveals nothing and eliminates nobody.
    expect(view!.players[1]!.out).toBe(false);
    expect(view!.players[1]!.handCount).toBe(1);
  });

  it('maps baronTied to a tie entry carrying the played Baron', () => {
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), SELF);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, SELF);
    view = reduceView(view, { type: 'baronTied', playerId: 'A', targetId: 'B', rank: 3 }, SELF);
    expect(view!.log.at(-1)).toMatchObject({
      kind: 'tie',
      params: { playerId: 'A', targetId: 'B', rank: 3 },
    });
  });

  it('completion entries are public to every viewer — no card payload to redact', () => {
    // The events carry no card, so every perspective folds the same entry.
    let view: ViewState | null = buildView(makeGame([p('A', { name: 'Alice' }), p('B', { name: 'Bob' })], { deck: [] }), OTHER);
    view = reduceView(view, { type: 'roundStarted', roundNumber: 1, firstPlayerId: 'A', deckCount: 10, faceUpRemoved: [] }, OTHER);
    view = reduceView(view, { type: 'guardMissed', playerId: 'A', targetId: 'B', guessRank: 8, rank: 1 }, OTHER);
    view = reduceView(view, { type: 'baronTied', playerId: 'B', targetId: 'A', rank: 3 }, OTHER);
    expect(view!.log.at(-2)).toMatchObject({ kind: 'miss', params: { playerId: 'A', targetId: 'B', rank: 8, played: 1 } });
    expect(view!.log.at(-1)).toMatchObject({ kind: 'tie', params: { playerId: 'B', targetId: 'A', rank: 3 } });
  });
});
