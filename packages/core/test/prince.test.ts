import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p } from './helpers.js';

/** A round where A (current turn) holds Prince+Guard and B holds a Priest. */
function princeRound() {
  return makeGame(
    [p('A', { hand: [card(5), card(1)] }), p('B', { hand: [card(2)] })],
    { deck: deckOf(6, 7, 8) },
  );
}

function playPrinceOn(s: ReturnType<typeof makeGame>, target: string) {
  let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
  if (!result.ok) throw new Error(result.error);
  return apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'prince', targetPlayerId: target } });
}

describe('Prince (5)', () => {
  it('the target discards their hand without effect and draws a new card', () => {
    const result = playPrinceOn(princeRound(), 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDiscarded')[0]).toMatchObject({ playerId: 'B', card: card(2), reason: 'prince' });
    // first draw: the Prince's replacement; then B's own turn draws again
    expect(eventsOf(result.events, 'cardDrawn')).toHaveLength(2);
    const b = result.state.players[1]!;
    // B drew the King (6) then the Countess (7) — the pair forces her discard.
    expect(b.hand).toEqual([card(6)]);
    expect(b.discardPile).toEqual([card(2), card(7)]);
    expect(b.out).toBe(false);
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
  });

  it('can target yourself', () => {
    const result = playPrinceOn(princeRound(), 'A');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDiscarded')).toHaveLength(1);
    expect(result.state.players[0]!.hand).toHaveLength(1);
    expect(eventsOf(result.events, 'cardDrawn')[0]).toMatchObject({ playerId: 'A' });
  });

  it('Prince’d Princess is out with no replacement draw', () => {
    const s = makeGame(
      [p('A', { hand: [card(5), card(1)] }), p('B', { hand: [card(8)] })],
      { deck: deckOf(6, 7, 8) },
    );
    const result = playPrinceOn(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDiscarded')[0]).toMatchObject({ card: card(8), reason: 'prince' });
    expect(eventsOf(result.events, 'playerEliminated')[0]).toMatchObject({ playerId: 'B', reason: 'princess' });
    expect(eventsOf(result.events, 'cardDrawn')).toHaveLength(0);
    expect(result.state.players[1]!.out).toBe(true);
    expect(result.state.players[1]!.hand).toHaveLength(0);
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['A'], reason: 'last-standing' });
  });

  it('must choose yourself when every other player is protected — even at the cost of the Princess', () => {
    const s = makeGame(
      [p('A', { hand: [card(5), card(8)] }), p('B', { hand: [card(2)], protected: true })],
      { deck: deckOf(6, 7, 8) },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    expect(result.state.pendingChoice).toMatchObject({ kind: 'prince', targets: ['A'] });
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'prince', targetPlayerId: 'A' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Forced self-Prince discarding the Princess eliminates A (rules §5, §8.7).
    expect(eventsOf(result.events, 'playerEliminated')[0]).toMatchObject({ playerId: 'A', reason: 'princess' });
    expect(result.state.players[0]!.out).toBe(true);
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['B'] });
  });

  it('rejects a protected target', () => {
    const s = makeGame(
      [p('A', { hand: [card(5), card(1)] }), p('B', { hand: [card(2)], protected: true })],
      { deck: deckOf(6, 7, 8) },
    );
    let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'prince', targetPlayerId: 'B' } });
    expect(result).toMatchObject({ ok: false });
  });
});

describe('Prince: empty-deck draw (ruling 4)', () => {
  it('2 players draw the single face-down burned card', () => {
    const s = makeGame(
      [p('A', { hand: [card(5), card(1)] }), p('B', { hand: [card(2)] })],
      { deck: [], burned: card(3) },
    );
    const result = playPrinceOn(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDrawn')[0]).toMatchObject({ playerId: 'B', card: card(3) });
    expect(result.state.burned).toBeNull();
    expect(result.state.deck).toHaveLength(0);
    // the deck is empty, so the round ends and B's hand is revealed
    expect(result.state.players[1]!.discardPile).toContainEqual(card(3));
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ reason: 'highest-hand' });
  });

  it('the face-up 2-player removals are never drawn', () => {
    const s = makeGame(
      [p('A', { hand: [card(5), card(1)] }), p('B', { hand: [card(2)] })],
      { deck: [], burned: null, faceUpRemoved: [card(5), card(6), card(7)] },
    );
    const result = playPrinceOn(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardDrawn')).toHaveLength(0);
    expect(result.state.players[1]!.hand).toHaveLength(0);
    expect(result.state.faceUpRemoved).toHaveLength(3);
  });
});
