/**
 * The story seam (ticket 38) — the pure functions under `useStory`: how
 * fresh log entries fold into scenes and the draw ledger, how draws
 * classify against the story position (held vs released), the forced-
 * Countess cancellation (edge ①), the burned-card draw (edge ②), two-draw
 * bursts (edge ③), and the reduced-motion/reconnect immediacy (edge ④).
 * The hook/queue/CSS behavior lives in the ui-smoke drawSync scenario.
 */

import { describe, expect, it } from 'vitest';
import type { LogEntry, ViewState } from '@love-letter/core';
import type { SceneOrBanner } from './scenes';
import {
  heldAndReleased,
  initialStoryState,
  lagViewOf,
  storyFor,
  storyPosition,
  type DrawRecord,
  type StoryState,
} from './story';

const entry = (id: number, kind: LogEntry['kind'], params: LogEntry['params']): LogEntry => ({ id, kind, params });
const fmt = () => 'banner text';
const state = () => initialStoryState();

/** A draw log entry as the fold produces it (ticket 38 D). */
const draw = (id: number, playerId: string, opts: { shrunk?: boolean; name?: string } = {}) =>
  entry(id, 'draw', {
    playerId,
    shrunk: opts.shrunk ?? true,
    ...(opts.name !== undefined ? { name: opts.name } : {}),
  });

/** Run one batch through the seam; shorthand for the common case. */
const run = (entries: LogEntry[], st: StoryState = state(), position?: number) =>
  storyFor(entries, st, fmt, undefined, position);

const ids = (ds: DrawRecord[]) => ds.map((d) => d.entryId);

/** A minimal true view — the lagged view derives from it. */
const baseView = (): ViewState => ({
  phase: 'round',
  roomCode: 'ABCD',
  capacity: 2,
  tokenTarget: 7,
  roundNumber: 1,
  players: [
    { id: 'A', name: 'Alice', tokens: 0, out: false, protected: false, discardPile: [], handCount: 2 },
    { id: 'B', name: 'Bob', tokens: 0, out: false, protected: false, discardPile: [], handCount: 1 },
  ],
  currentTurn: 'A',
  pendingChoice: null,
  deckCount: 10,
  burnedCount: 1,
  faceUpRemoved: [],
  roundWinnerIds: [],
  matchWinnerId: null,
  hand: [{ rank: 1, name: 'Guard' }],
  log: [],
  logSeq: 0,
  roster: { A: 'Alice', B: 'Bob' },
});
const view = (over: Partial<ViewState> = {}): ViewState => ({ ...baseView(), ...over });

describe('storyFor (ticket 38) — the scene builder plus the draw ledger', () => {
  it('folds draw entries into the ledger and emits the scenes unchanged', () => {
    const { scenes, state: next } = run([entry(1, 'play', { playerId: 'A', rank: 4 }), draw(2, 'B')]);
    expect(scenes).toHaveLength(1); // only the handmaid play — draws never narrate
    expect(scenes[0]).toMatchObject({ kind: 'simple', actorId: 'A', playedRank: 4 });
    expect(next.draws).toEqual([
      { entryId: 2, playerId: 'B', shrunk: true, cancelled: false },
    ]);
  });

  it('carries the drawn card name only when the stream knows it (privacy)', () => {
    const mine = run([draw(2, 'A', { name: 'Countess' })]);
    expect(mine.state.draws[0]).toMatchObject({ entryId: 2, playerId: 'A', name: 'Countess' });
    const theirs = run([draw(2, 'A')]);
    expect(theirs.state.draws[0]).toMatchObject({ entryId: 2, playerId: 'A' });
    expect(theirs.state.draws[0]!.name).toBeUndefined();
  });

  it('remembers draws across batches — the ledger is the memory', () => {
    let s = state();
    ({ state: s } = run([draw(6, 'B')], s));
    const next = run([entry(7, 'play', { playerId: 'C', rank: 4 }), draw(8, 'C')], s);
    expect(next.state.draws.map((d) => d.entryId)).toEqual([6, 8]);
  });
});

describe('heldAndReleased + storyPosition — the story tells up to its position', () => {
  it('holds a draw beyond the story position and releases it once the position passes', () => {
    // The queue is busy with a scene narrating entry 8 — the draw (11) folds
    // while it plays → held.
    const first = run([draw(11, 'B'), entry(12, 'play', { playerId: 'C', rank: 4 })], state(), 8);
    expect(first.held.map((d) => d.entryId)).toEqual([11]);
    expect(first.released).toEqual([]);
    // The queue drains — the position jumps to the newest id → released.
    const second = heldAndReleased(first.state.draws, 12);
    expect(second.held).toEqual([]);
    expect(second.released.map((d) => d.entryId)).toEqual([11]);
  });

  it('holds draws that fold behind multiple queued scenes until the queue drains', () => {
    let s = state();
    // Two draws land while the queue still plays the head scene (entry 4).
    ({ state: s } = run([draw(11, 'B')], s, 4));
    ({ state: s } = run([draw(13, 'C')], s, 4));
    const { held, released } = heldAndReleased(s.draws, 4);
    expect(ids(held)).toEqual([11, 13]);
    expect(released).toEqual([]);
  });

  it('releases instantly when the queue never fills — reduced motion (edge ④)', () => {
    // Reduced motion enqueues nothing, so the position is always the newest
    // log id — a draw that just folded is the newest → released immediately.
    const { held, released } = run([draw(11, 'B')], state(), 11);
    expect(held).toEqual([]);
    expect(released.map((d) => d.entryId)).toEqual([11]);
  });

  it('never holds on the mount baseline — reconnect (edge ④)', () => {
    // The baseline skips the replayed history — the ledger starts empty, so
    // even a busy position holds nothing.
    const { held, released } = run([], state(), 8);
    expect(held).toEqual([]);
    expect(released).toEqual([]);
  });

  it('classifies cancelled draws out of both sets', () => {
    const s = initialStoryState();
    s.draws = [{ entryId: 6, playerId: 'B', shrunk: true, cancelled: true }];
    expect(heldAndReleased(s.draws, 4)).toEqual({ held: [], released: [] });
    expect(heldAndReleased(s.draws, 8)).toEqual({ held: [], released: [] });
  });
});

describe('storyPosition', () => {
  it('is the head beat\'s entry id while the queue plays', () => {
    const log = [entry(1, 'info', { what: 'roundStarted', roundNumber: 1 }), entry(2, 'play', { playerId: 'A', rank: 4 })];
    const head: SceneOrBanner = { key: 's1', entryId: 2, kind: 'simple', actorId: 'A', playedRank: 4 };
    expect(storyPosition(log, head)).toBe(2);
  });

  it('is the newest log id when idle', () => {
    const log = [entry(1, 'info', { what: 'roundStarted', roundNumber: 1 }), entry(2, 'play', { playerId: 'A', rank: 4 })];
    expect(storyPosition(log, undefined)).toBe(2);
    expect(storyPosition([], undefined)).toBeUndefined();
  });
});

describe('edge ① — the forced-Countess cancellation', () => {
  it('cancels a held draw whose card is force-discarded in the same burst (the drawer\'s own stream)', () => {
    // The queue is busy (position 5). B draws the Countess (6) — held — then
    // her forced discard (7) arrives in the same burst. The drawer's own
    // stream knows the drawn card: the identity match cancels it.
    let s = state();
    ({ state: s } = run([draw(6, 'B', { name: 'Countess' })], s, 5));
    const after = run([entry(7, 'discard', { playerId: 'B', rank: 7, reason: 'countess' })], s, 5);
    expect(after.state.draws[0]!.cancelled).toBe(true);
    // A cancelled draw never releases — releasing it would show a card that
    // is gone and underflow the hand count.
    expect(heldAndReleased(after.state.draws, 7).released).toEqual([]);
  });

  it('cancels the player\'s most recent held draw when the stream sees no name (other viewers)', () => {
    // No name on this stream — the hand count is public, so it must not
    // underflow there either; the identity of the cancelled draw does not
    // change the count.
    let s = state();
    ({ state: s } = run([draw(6, 'B')], s, 5));
    const after = run([entry(7, 'discard', { playerId: 'B', rank: 7, reason: 'countess' })], s, 5);
    expect(after.state.draws[0]!.cancelled).toBe(true);
  });

  it('cancels the right draw when a countess discard follows a two-draw burst (edge ① + ③)', () => {
    // B draws the Countess (9; her forced discard is 10), then the turn
    // passes and C draws (12). The identity match cancels only B's Countess
    // draw — C's draw stays held.
    let s = state();
    ({ state: s } = run([draw(9, 'B', { name: 'Countess' })], s, 8));
    const after = run(
      [
        entry(10, 'discard', { playerId: 'B', rank: 7, reason: 'countess' }),
        entry(11, 'play', { playerId: 'C', rank: 4 }),
        draw(12, 'C', { name: 'King' }),
      ],
      s,
      8,
    );
    const byId = Object.fromEntries(after.state.draws.map((d) => [d.entryId, d]));
    expect(byId[9]!.cancelled).toBe(true);
    expect(byId[12]!.cancelled).toBe(false);
    expect(ids(after.held)).toEqual([12]);
  });

  it('never cancels for a Prince discard, or a draw the story already told', () => {
    // A Prince discard removes a different card — the drawn card stays held.
    let s = state();
    ({ state: s } = run([draw(6, 'B')], s, 5));
    const prince = run([entry(7, 'discard', { playerId: 'B', rank: 3, reason: 'prince' })], s, 5);
    expect(prince.state.draws[0]!.cancelled).toBe(false);
    // A released draw (entryId ≤ position) was already applied — cancelling
    // it would drop it from the display retroactively.
    const released = run([entry(7, 'discard', { playerId: 'B', rank: 7, reason: 'countess' })], s, 6);
    expect(released.state.draws[0]!.cancelled).toBe(false);
  });
});

describe('edge ③ — two draws in one burst', () => {
  it('holds a Prince\'d target\'s draw and the next turn\'s draw together, releasing both at the drain', () => {
    let s = state();
    const burst = run(
      [
        draw(9, 'B', { name: 'Guard' }),
        entry(10, 'play', { playerId: 'C', rank: 4 }),
        draw(11, 'C'),
      ],
      s,
      8,
    );
    expect(ids(burst.held)).toEqual([9, 11]);
    expect(burst.released).toEqual([]);
    // The drain releases both at the same moment.
    const { held, released } = heldAndReleased(burst.state.draws, 11);
    expect(held).toEqual([]);
    expect(ids(released)).toEqual([9, 11]);
  });
});

describe('lagViewOf (ticket 38) — the lagged display view', () => {
  it('withholds held draws: hand by identity, deck by shrunk, counts minus held', () => {
    const v = view({
      deckCount: 10,
      hand: [
        { rank: 1, name: 'Guard' },
        { rank: 1, name: 'Guard' },
        { rank: 2, name: 'Priest' },
      ],
      players: [
        { id: 'A', name: 'Alice', tokens: 0, out: false, protected: false, discardPile: [], handCount: 3 },
        { id: 'B', name: 'Bob', tokens: 0, out: false, protected: false, discardPile: [], handCount: 2 },
      ],
    });
    const held: DrawRecord[] = [
      { entryId: 6, playerId: 'A', shrunk: true, name: 'Guard', cancelled: false },
      { entryId: 7, playerId: 'B', shrunk: true, cancelled: false },
    ];
    const lagged = lagViewOf(v, held);
    expect(lagged.deckCount).toBe(12); // both held draws shrank the deck — inflated back
    expect(lagged.players[0]!.handCount).toBe(2); // A's held draw withheld
    expect(lagged.players[1]!.handCount).toBe(1); // B's held draw withheld
    // The held Guard comes out of the hand by identity — the duplicate keeps
    // its own slot.
    expect(lagged.hand).toEqual([
      { rank: 1, name: 'Guard' },
      { rank: 2, name: 'Priest' },
    ]);
    // Everything else is untouched.
    expect(lagged.phase).toBe('round');
    expect(lagged.players[0]!.tokens).toBe(0);
    expect(lagged.currentTurn).toBe('A');
  });

  it('never inflates the deck for a burned-card draw (edge ②)', () => {
    const v = view({ deckCount: 0 });
    const lagged = lagViewOf(v, [{ entryId: 6, playerId: 'B', shrunk: false, cancelled: false }]);
    expect(lagged.deckCount).toBe(0); // not inflated — the deck never shrank
    expect(lagged.players[1]!.handCount).toBe(0); // the hand is still held
  });

  it('returns the view itself when nothing is held', () => {
    const v = view();
    expect(lagViewOf(v, [])).toBe(v);
  });
});
