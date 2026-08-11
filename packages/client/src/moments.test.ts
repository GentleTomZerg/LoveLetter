/**
 * Card-moment mapping (ticket 22) — which log entries animate, what the
 * animation shows, and the fact cache that gives resolution flies their
 * card art. The DOM/queue/CSS behavior lives in the ui-smoke scenario.
 */

import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@love-letter/core';
import { initialMomentState, momentsFor, type Moment } from './moments';

const entry = (id: number, kind: LogEntry['kind'], params: LogEntry['params']): LogEntry => ({ id, kind, params });
const fmt = () => 'banner text';

const state = () => initialMomentState();
const fly = (m: Moment | undefined) => (m?.kind === 'fly' ? m : null);

describe('momentsFor (ticket 22)', () => {
  it('remembers the played card and lets non-targeting plays fly to the pile', () => {
    const { state: s, moments } = momentsFor(entry(1, 'play', { playerId: 'A', rank: 4 }), state(), fmt);
    expect(fly(moments[0])).toEqual({ key: 'e1', kind: 'fly', rank: 4, from: 'A', to: 'A', toPile: true });
    expect(s.lastPlayed['A']).toBe(4);
  });

  it('does not fly targeting plays yet — the resolution entry carries the story', () => {
    const { state: s, moments } = momentsFor(entry(1, 'play', { playerId: 'A', rank: 3 }), state(), fmt);
    expect(moments).toEqual([]);
    expect(s.lastPlayed['A']).toBe(3);
  });

  it('flies the resolution card at the target using the fact cache (Baron)', () => {
    let s = state();
    ({ state: s } = momentsFor(entry(1, 'play', { playerId: 'A', rank: 3 }), s, fmt));
    const { moments } = momentsFor(entry(2, 'baron', { playerId: 'A', targetId: 'B' }), s, fmt);
    expect(fly(moments[0])).toEqual({ key: 'e2', kind: 'fly', rank: 3, from: 'A', to: 'B', toPile: false });
  });

  it('covers prince, king, and peek resolutions the same way', () => {
    let s = state();
    ({ state: s } = momentsFor(entry(1, 'play', { playerId: 'A', rank: 5 }), s, fmt));
    const prince = momentsFor(entry(2, 'prince', { playerId: 'A', targetId: 'C' }), s, fmt).moments;
    expect(fly(prince[0])?.to).toBe('C');

    ({ state: s } = momentsFor(entry(3, 'play', { playerId: 'B', rank: 6 }), s, fmt));
    const king = momentsFor(entry(4, 'king', { playerId: 'B', targetId: 'A' }), s, fmt).moments;
    expect(fly(king[0])?.rank).toBe(6);

    ({ state: s } = momentsFor(entry(5, 'play', { playerId: 'C', rank: 2 }), s, fmt));
    const peek = momentsFor(entry(6, 'peek', { playerId: 'C', targetId: 'A' }), s, fmt).moments;
    expect(fly(peek[0])?.rank).toBe(2);
  });

  it('flies the guessed card on a Guard accusation, not a cached one', () => {
    let s = state();
    ({ state: s } = momentsFor(entry(1, 'play', { playerId: 'A', rank: 1 }), s, fmt));
    const { moments } = momentsFor(entry(2, 'guard', { playerId: 'A', targetId: 'B', rank: 8 }), s, fmt);
    expect(fly(moments[0])).toEqual({ key: 'e2', kind: 'fly', rank: 8, from: 'A', to: 'B', toPile: false });
  });

  it('flies discards to the owner pile (Prince target and forced Countess)', () => {
    const prince = momentsFor(entry(1, 'discard', { playerId: 'B', rank: 2, reason: 'prince' }), state(), fmt).moments;
    expect(fly(prince[0])).toEqual({ key: 'e1', kind: 'fly', rank: 2, from: 'B', to: 'B', toPile: true });
    const countess = momentsFor(entry(2, 'discard', { playerId: 'A', rank: 7, reason: 'countess' }), state(), fmt).moments;
    expect(fly(countess[0])?.rank).toBe(7);
  });

  it('flashes reveals at the owner seat and banners round/match', () => {
    const reveal = momentsFor(entry(1, 'reveal', { playerId: 'B', rank: 1 }), state(), fmt).moments;
    expect(reveal[0]).toEqual({ key: 'e1', kind: 'flash', rank: 1, at: 'B' });
    const round = momentsFor(entry(2, 'round', { winners: ['A'], reason: 'last-standing' }), state(), fmt).moments;
    expect(round[0]).toEqual({ key: 'e2', kind: 'banner', text: 'banner text' });
  });

  it('never animates informational, elimination, or choice lines', () => {
    for (const e of [
      entry(1, 'choice', { playerId: 'A' }),
      entry(2, 'join', { playerId: 'B' }),
      entry(3, 'leave', { playerId: 'B' }),
      entry(4, 'info', { what: 'roomCreated', roomCode: 'ABCD' }),
      entry(5, 'eliminate', { playerId: 'B', reason: 'guard' }),
    ]) {
      const { moments } = momentsFor(e, state(), fmt);
      expect(moments, e.kind).toEqual([]);
    }
  });

  it('does not leak the peeked card — only the played Priest flies', () => {
    let s = state();
    ({ state: s } = momentsFor(entry(1, 'play', { playerId: 'A', rank: 2 }), s, fmt));
    // The peeker's own stream carries the peeked rank; the animation must not use it.
    const { moments } = momentsFor(entry(2, 'peek', { playerId: 'A', targetId: 'B', rank: 8 }), s, fmt);
    expect(fly(moments[0])?.rank).toBe(2);
  });
});
