/**
 * Latest-event strip logic (ticket 19) — the pure seam under the collapsed
 * log: which entry the strip shows and whether it carries a mini thumbnail.
 * The collapse/expand DOM behavior itself lives in the ui-smoke scenario.
 */

import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@love-letter/core';
import type { LogContext } from './logFormat';
import { entryRank, formatLogEntry, latestLogEntry, mergeLog, type ActivityLine } from './logFormat';
import { t } from './index';
import { CARD_TEXT } from './cards';

const play = (id: number, rank: number): LogEntry => ({ id, kind: 'play', params: { playerId: 'A', rank } });
const info = (id: number, what: string): LogEntry => ({ id, kind: 'info', params: { what } });
/** An activity line with its socket arrival stamp (ticket 31). */
const line = (id: number, what: string, arrival: number): ActivityLine => ({ ...info(id, what), arrival });
/** The entry without client-side stamps — for equality checks. */
const plain = (e: LogEntry) => ({ id: e.id, kind: e.kind, params: e.params });

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
    // Ticket 38: a draw carries the drawn card's *name*, not a rank — the
    // strip thumbnail stays rank-keyed, so a draw shows no thumbnail.
    expect(entryRank({ id: 7, kind: 'draw', params: { playerId: 'A', shrunk: true, name: 'Countess' } })).toBeUndefined();
  });

  it('treats out-of-range ranks as absent', () => {
    expect(entryRank({ id: 1, kind: 'play', params: { playerId: 'A', rank: 9 } })).toBeUndefined();
  });
});

describe('latestLogEntry (tickets 19 + 31)', () => {
  it('shows the newest by socket arrival across both sequences', () => {
    // A reconnect line that arrived last wins…
    const log = [play(1, 3)];
    const activity = [line(0, 'playerGone', 2), line(1, 'playerBack', 3)];
    expect(plain(latestLogEntry(log, activity, { 1: 1 })!)).toEqual(plain(info(1, 'playerBack')));
    // …but a game entry landing after it takes the strip straight back
    // (the old code preferred activity forever — ticket 31).
    const log2 = [play(1, 3), play(2, 5)];
    expect(latestLogEntry(log2, activity, { 1: 1, 2: 4 })).toEqual(play(2, 5));
    // And an activity line arriving after the log entry wins again.
    const activity2 = [...activity, line(2, 'playerGone', 5)];
    expect(plain(latestLogEntry(log2, activity2, { 1: 1, 2: 4 })!)).toEqual(plain(info(2, 'playerGone')));
  });

  it('falls back to the newest log entry when activity is empty', () => {
    expect(latestLogEntry([play(1, 3), play(2, 5)], [], { 1: 1, 2: 2 })).toEqual(play(2, 5));
  });

  it('is undefined when both sequences are empty (lobby placeholder)', () => {
    expect(latestLogEntry([], [], {})).toBeUndefined();
  });
});

describe('mergeLog (ticket 31)', () => {
  it('orders the expanded list newest-first across both sequences, with stable keys', () => {
    const log = [play(1, 3), play(2, 5)];
    const activity = [line(0, 'playerGone', 3), line(1, 'playerBack', 5)];
    const merged = mergeLog(log, activity, { 1: 1, 2: 2 });
    expect(merged.map((m) => plain(m.entry))).toEqual([
      plain(info(1, 'playerBack')),
      plain(info(0, 'playerGone')),
      plain(play(2, 5)),
      plain(play(1, 3)),
    ]);
    expect(merged.map((m) => m.key)).toEqual(['a1', 'a0', 'v2', 'v1']);
  });

  it('sorts entries without an arrival stamp as the oldest (defensive)', () => {
    const merged = mergeLog([play(2, 5)], [line(0, 'playerBack', 3)], {});
    expect(merged.map((m) => plain(m.entry))).toEqual([plain(info(0, 'playerBack')), plain(play(2, 5))]);
  });
});

describe('formatLogEntry: draw lines (ticket 38)', () => {
  const ctx: LogContext = {
    selfId: 'A',
    roster: { A: 'Alice', B: 'Bob' },
    t: (key, params) => t('en', key, params),
    cardName: (rank) => CARD_TEXT.en.name[rank],
  };
  const draw = (id: number, params: LogEntry['params']): LogEntry => ({ id, kind: 'draw', params });

  it('renders "drew a card" for other players and names the card on the drawer\'s own stream', () => {
    expect(formatLogEntry(draw(1, { playerId: 'B' }), ctx)).toBe('Bob drew a card');
    // The drawer's own stream carries the drawn card's name — the self line.
    expect(formatLogEntry(draw(2, { playerId: 'A', shrunk: true, name: 'Countess' }), ctx)).toBe('You drew Countess');
    expect(formatLogEntry(draw(3, { playerId: 'B', shrunk: true }), ctx)).toBe('Bob drew a card');
  });
});

