import { describe, expect, it } from 'vitest';
import { apply } from '../src/index.js';
import type { Rank } from '../src/index.js';
import { card, deckOf, eventsOf, makeGame, p } from './helpers.js';

/** A round where A (current turn) holds Baron+X and B holds a given card. */
function baronRound(after: [Rank, Rank] = [3, 1], bRank: Rank = 2) {
  return makeGame(
    [p('A', { hand: [card(after[0]), card(after[1])] }), p('B', { hand: [card(bRank)] })],
    { deck: deckOf(5, 6, 7) },
  );
}

function playBaronAgainst(s: ReturnType<typeof makeGame>, target: string) {
  let result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
  if (!result.ok) throw new Error(result.error);
  return apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'baron', targetPlayerId: target } });
}

describe('Baron (3)', () => {
  it('eliminates the player with the lower remaining hand', () => {
    // A holds Baron+Priest → Priest (2); B holds Guard (1) → B loses.
    const result = playBaronAgainst(baronRound([3, 2], 1), 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'playerEliminated')[0]).toMatchObject({ playerId: 'B', reason: 'baron' });
    expect(eventsOf(result.events, 'handRevealed')).toEqual([{ type: 'handRevealed', playerId: 'B', card: card(1) }]);
    expect(result.state.players[1]!.out).toBe(true);
    // B was the only other player → last player standing ends the round
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['A'], reason: 'last-standing' });
  });

  it('can knock out the player who played it (mandatory self-destruction)', () => {
    // A holds Baron+Guard → Guard (1); B holds Priest (2) → A loses.
    const result = playBaronAgainst(baronRound(), 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'playerEliminated')[0]).toMatchObject({ playerId: 'A', reason: 'baron' });
    expect(result.state.players[0]!.out).toBe(true);
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['B'] });
  });

  it('a tie changes nothing and the turn passes', () => {
    const s = makeGame(
      [p('A', { hand: [card(3), card(2)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = playBaronAgainst(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
    expect(result.state.players.every((p) => !p.out)).toBe(true);
    expect(result.state.currentTurn).toBe('B');
  });

  it('a tie ends with an explicit `baronTied` completion event (ticket 26)', () => {
    const s = makeGame(
      [p('A', { hand: [card(3), card(2)] }), p('B', { hand: [card(2)] })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = playBaronAgainst(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Equal hands reveal nothing (rules spec §4.3) — the event carries only
    // who compared, against whom, and the (public) played Baron.
    expect(eventsOf(result.events, 'baronTied')).toEqual([
      { type: 'baronTied', playerId: 'A', targetId: 'B', rank: 3 },
    ]);
    expect(eventsOf(result.events, 'handRevealed')).toHaveLength(0);
    // The completion precedes the turn passing.
    const idx = result.events.findIndex((e) => e.type === 'baronTied');
    const turnIdx = result.events.findIndex((e) => e.type === 'turnStarted');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(turnIdx);
  });

  it('a tie completes with `baronTied` in 3p and 4p, nobody eliminated', () => {
    for (const players of [
      [p('A', { hand: [card(3), card(2)] }), p('B', { hand: [card(2)] }), p('C', { hand: [card(5)] })],
      [
        p('A', { hand: [card(3), card(2)] }),
        p('B', { hand: [card(2)] }),
        p('C', { hand: [card(5)] }),
        p('D', { hand: [card(6)] }),
      ],
    ]) {
      const result = playBaronAgainst(makeGame(players, { deck: deckOf(7, 8, 8, 8, 8, 8, 8) }), 'B');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(eventsOf(result.events, 'baronTied')).toEqual([
        { type: 'baronTied', playerId: 'A', targetId: 'B', rank: 3 },
      ]);
      expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
      expect(result.state.currentTurn).toBe('B'); // seat order — nobody was eliminated
    }
  });

  it('a tie as the final action precedes the deck-empty round reveals', () => {
    // Deck empty at resolution: the tie completes first, then both hands
    // reveal for the highest-hand comparison (A's discard total wins the tie).
    const s = makeGame([p('A', { hand: [card(3), card(2)] }), p('B', { hand: [card(2)] })], { deck: [] });
    const result = playBaronAgainst(s, 'B');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'baronTied')).toEqual([
      { type: 'baronTied', playerId: 'A', targetId: 'B', rank: 3 },
    ]);
    const tieIdx = result.events.findIndex((e) => e.type === 'baronTied');
    const revealIdx = result.events.findIndex((e) => e.type === 'handRevealed');
    expect(tieIdx).toBeGreaterThanOrEqual(0);
    expect(tieIdx).toBeLessThan(revealIdx);
    // A tie eliminates nobody — the round ends on the highest hand.
    expect(eventsOf(result.events, 'playerEliminated')).toHaveLength(0);
    expect(eventsOf(result.events, 'roundEnded')[0]).toMatchObject({ winnerIds: ['A'], reason: 'highest-hand' });
  });

  it('fizzles when the only opponent is protected', () => {
    const s = makeGame(
      [p('A', { hand: [card(3), card(1)] }), p('B', { hand: [card(2)], protected: true })],
      { deck: deckOf(5, 6, 7) },
    );
    const result = apply(s, { type: 'playCard', playerId: 'A', which: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(eventsOf(result.events, 'cardFizzled')).toHaveLength(1);
    expect(result.state.pendingChoice).toBeNull();
  });

  it('rejects an illegal target', () => {
    let result = apply(baronRound(), { type: 'playCard', playerId: 'A', which: 0 });
    if (!result.ok) throw new Error(result.error);
    result = apply(result.state, { type: 'choice', playerId: 'A', choice: { kind: 'baron', targetPlayerId: 'NOPE' } });
    expect(result).toMatchObject({ ok: false });
  });
});
