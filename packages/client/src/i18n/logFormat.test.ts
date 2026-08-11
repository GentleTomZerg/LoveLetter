/**
 * Latest-event strip logic (ticket 19) — the pure seam under the collapsed
 * log: which entry the strip shows and whether it carries a mini thumbnail.
 * The collapse/expand DOM behavior itself lives in the ui-smoke scenario.
 */

import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@love-letter/core';
import { entryRank, latestLogEntry } from './logFormat';

const play = (id: number, rank: number): LogEntry => ({ id, kind: 'play', params: { playerId: 'A', rank } });
const info = (id: number, what: string): LogEntry => ({ id, kind: 'info', params: { what } });

describe('entryRank (ticket 19)', () => {
  it('returns the rank for rank-bearing kinds', () => {
    expect(entryRank({ id: 1, kind: 'play', params: { playerId: 'A', rank: 3 } })).toBe(3);
    expect(entryRank({ id: 2, kind: 'fizzle', params: { playerId: 'A', rank: 1 } })).toBe(1);
    expect(entryRank({ id: 3, kind: 'guard', params: { playerId: 'A', targetId: 'B', rank: 8 } })).toBe(8);
    expect(entryRank({ id: 4, kind: 'reveal', params: { playerId: 'B', rank: 5 } })).toBe(5);
    expect(entryRank({ id: 5, kind: 'discard', params: { playerId: 'B', rank: 2, reason: 'prince' } })).toBe(2);
    expect(entryRank({ id: 6, kind: 'peek', params: { playerId: 'A', targetId: 'B', rank: 7 } })).toBe(7);
  });

  it('returns undefined when the entry carries no rank', () => {
    expect(entryRank({ id: 1, kind: 'baron', params: { playerId: 'A', targetId: 'B' } })).toBeUndefined();
    expect(entryRank({ id: 2, kind: 'round', params: { winners: ['A'], reason: 'last-standing' } })).toBeUndefined();
    expect(entryRank({ id: 3, kind: 'info', params: { what: 'roomCreated', roomCode: 'ABCD' } })).toBeUndefined();
    expect(entryRank({ id: 4, kind: 'discard', params: { playerId: 'B', reason: 'countess' } })).toBeUndefined();
    expect(entryRank({ id: 5, kind: 'peek', params: { playerId: 'A', targetId: 'B' } })).toBeUndefined();
    expect(entryRank({ id: 6, kind: 'choice', params: { playerId: 'A' } })).toBeUndefined();
  });

  it('treats out-of-range ranks as absent', () => {
    expect(entryRank({ id: 1, kind: 'play', params: { playerId: 'A', rank: 9 } })).toBeUndefined();
  });
});

describe('latestLogEntry (ticket 19)', () => {
  it('prefers the newest activity line when any exist', () => {
    const log = [play(1, 3), play(2, 5)];
    const activity = [info(0, 'playerGone'), info(1, 'playerBack')];
    expect(latestLogEntry(log, activity)).toEqual(info(1, 'playerBack'));
  });

  it('falls back to the newest log entry when activity is empty', () => {
    expect(latestLogEntry([play(1, 3), play(2, 5)], [])).toEqual(play(2, 5));
  });

  it('is undefined when both sequences are empty (lobby placeholder)', () => {
    expect(latestLogEntry([], [])).toBeUndefined();
  });
});
