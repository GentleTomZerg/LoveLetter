/**
 * Scene derivation (ticket 23) — how fresh log entries correlate into one
 * scene per play (the three-step template), plus the pure stage
 * decomposition the renderer plays. Guard/baron/prince resolutions are
 * split in two — the sweep plays at the marker, the verdict beat when the
 * reveal/discard decides it — so a split between the marker and its
 * consequences can never finalize a wrong verdict, and a missed Guard still
 * animates on time. The DOM/queue/CSS behavior lives in the ui-smoke
 * scenario.
 */

import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@love-letter/core';
import { t } from './i18n';
import { CARD_TEXT } from './i18n/cards';
import { initialSceneState, scenesFor, sceneStages, type Scene, type SceneLoc, type SceneOrBanner } from './scenes';

const entry = (id: number, kind: LogEntry['kind'], params: LogEntry['params']): LogEntry => ({ id, kind, params });
const fmt = () => 'banner text';

const state = () => initialSceneState();

/** Run one batch through the seam; shorthand for the common case. */
const run = (entries: LogEntry[], st = state()) => scenesFor(entries, st, fmt);

const kinds = (scenes: SceneOrBanner[]) => scenes.map((s) => (s.kind === 'banner' ? 'banner' : s.kind));
const verdicts = (scenes: SceneOrBanner[]) =>
  scenes.filter((s): s is Scene => s.kind !== 'banner').map((s) => s.verdict?.key);

const loc: SceneLoc = {
  selfId: 'C',
  roster: { A: 'Alice', B: 'Bob', C: 'Carol' },
  t: (key, params) => t('en', key, params),
  cardName: (rank) => CARD_TEXT.en.name[rank],
};

describe('scenesFor (ticket 23) — scene builder', () => {
  it('makes non-targeting plays single-card scenes with the right verdict', () => {
    const handmaid = run([entry(1, 'play', { playerId: 'A', rank: 4 })]);
    expect(kinds(handmaid.scenes)).toEqual(['simple']);
    expect(verdicts(handmaid.scenes)).toEqual(['scene.handmaid']);

    const countess = run([entry(1, 'play', { playerId: 'A', rank: 7 })]);
    expect(verdicts(countess.scenes)).toEqual(['scene.countess']);

    const princess = run([entry(1, 'play', { playerId: 'A', rank: 8 })]);
    expect(verdicts(princess.scenes)).toEqual(['scene.princess']);
    expect(handmaid.state.lastPlayed['A']).toBe(4);
  });

  it('splits a Guard play into a prompt sweep and a hit verdict (Guard hit)', () => {
    let s = state();
    const first = run([entry(1, 'play', { playerId: 'A', rank: 1 }), entry(2, 'choice', { playerId: 'A' })], s);
    expect(first.scenes).toEqual([]); // the sweep waits for the resolution marker
    expect(first.state.pending).toEqual({ kind: 'guard', actorId: 'A', playedRank: 1 });

    const second = run(
      [
        entry(3, 'guard', { playerId: 'A', targetId: 'B', rank: 8 }),
        entry(4, 'reveal', { playerId: 'B', rank: 8 }),
        entry(5, 'eliminate', { playerId: 'B', reason: 'guard' }),
      ],
      first.state,
    );
    expect(kinds(second.scenes)).toEqual(['guard', 'guard']); // sweep + verdict beat
    const sweep = second.scenes[0] as Scene;
    expect(sweep.verdict).toBeUndefined(); // the sweep animates immediately
    expect(sweep.tag).toEqual({ key: 'scene.guard.accuses', params: { actorId: 'A', targetId: 'B', rank: 8 } });
    const verdict = second.scenes[1] as Scene;
    expect(verdict).toMatchObject({ kind: 'guard', actorId: 'A', targetId: 'B', playedRank: 1, guessRank: 8, revealedRank: 8, revealedAt: 'B' });
    expect(verdict.verdict).toEqual({ key: 'scene.guard.hit', params: { targetId: 'B', rank: 8 } });
    expect(second.state.pending).toBeNull();
  });

  it('resolves a Guard miss with no reveal (the real card stays private)', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 1 }), entry(2, 'choice', { playerId: 'A' })], s));
    const marker = run([entry(3, 'guard', { playerId: 'A', targetId: 'B', rank: 8 })], s);
    expect(kinds(marker.scenes)).toEqual(['guard']); // the sweep plays at once
    expect((marker.scenes[0] as Scene).verdict).toBeUndefined();
    const { scenes } = run([entry(4, 'play', { playerId: 'B', rank: 4 })], marker.state);
    expect(kinds(scenes)).toEqual(['guard', 'simple']); // the miss verdict, then B's play
    const verdict = scenes[0] as Scene;
    expect(verdict.revealedRank).toBeUndefined();
    expect(verdict.verdict).toEqual({ key: 'scene.guard.miss', params: { targetId: 'B', rank: 8 } });
  });

  it('finalizes a split resolution correctly — the marker and its reveal arrive in separate batches', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 1 }), entry(2, 'choice', { playerId: 'A' })], s));
    const marker = run([entry(3, 'guard', { playerId: 'A', targetId: 'B', rank: 8 })], s);
    expect(kinds(marker.scenes)).toEqual(['guard']); // the sweep
    const { scenes } = run(
      [entry(4, 'reveal', { playerId: 'B', rank: 8 }), entry(5, 'eliminate', { playerId: 'B', reason: 'guard' })],
      marker.state,
    );
    expect(kinds(scenes)).toEqual(['guard']);
    expect((scenes[0] as Scene).verdict).toEqual({ key: 'scene.guard.hit', params: { targetId: 'B', rank: 8 } });
  });

  it('keeps a missed Guard miss when the deck-empty reveals close it', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 1 }), entry(2, 'choice', { playerId: 'A' })], s));
    const marker = run([entry(3, 'guard', { playerId: 'A', targetId: 'B', rank: 8 })], s);
    const { scenes } = run(
      [entry(4, 'reveal', { playerId: 'C', rank: 6 }), entry(5, 'round', { winners: ['C'], reason: 'highest-hand' })],
      marker.state,
    );
    expect(kinds(scenes)).toEqual(['guard', 'banner']);
    expect((scenes[0] as Scene).verdict).toEqual({ key: 'scene.guard.miss', params: { targetId: 'B', rank: 8 } });
  });

  it('handles a whole targeting play in one batch (play + choice + resolution)', () => {
    const { scenes } = run([
      entry(1, 'play', { playerId: 'A', rank: 3 }),
      entry(2, 'choice', { playerId: 'A' }),
      entry(3, 'baron', { playerId: 'A', targetId: 'B' }),
      entry(4, 'reveal', { playerId: 'B', rank: 1 }),
      entry(5, 'eliminate', { playerId: 'B', reason: 'baron' }),
    ]);
    expect(kinds(scenes)).toEqual(['baron', 'baron']); // sweep + verdict beat
    expect((scenes[0] as Scene).verdict).toBeUndefined();
    const verdict = scenes[1] as Scene;
    expect(verdict).toMatchObject({ kind: 'baron', actorId: 'A', targetId: 'B', playedRank: 3, revealedRank: 1, revealedAt: 'B' });
    expect(verdict.verdict).toEqual({ key: 'scene.baron.vs', params: { actorId: 'A', rankA: 3, targetId: 'B', rankB: 1 } });
  });

  it('flags a Baron backfire when the actor loses (only their card is revealed)', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 3 }), entry(2, 'choice', { playerId: 'A' })], s));
    const { scenes } = run(
      [
        entry(3, 'baron', { playerId: 'A', targetId: 'B' }),
        entry(4, 'reveal', { playerId: 'A', rank: 7 }),
        entry(5, 'eliminate', { playerId: 'A', reason: 'baron' }),
      ],
      s,
    );
    expect(kinds(scenes)).toEqual(['baron', 'baron']);
    expect((scenes[1] as Scene).revealedAt).toBe('A');
    expect((scenes[1] as Scene).verdict).toEqual({ key: 'scene.baron.backfire', params: { actorId: 'A', rank: 7 } });
  });

  it('calls a Baron tie when nothing is revealed (finalized by the next trigger)', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 3 }), entry(2, 'choice', { playerId: 'A' })], s));
    const marker = run([entry(3, 'baron', { playerId: 'A', targetId: 'B' })], s);
    expect(kinds(marker.scenes)).toEqual(['baron']); // the sweep plays at once
    const { scenes } = run([entry(4, 'play', { playerId: 'B', rank: 4 })], marker.state);
    expect(kinds(scenes)).toEqual(['baron', 'simple']);
    const verdict = scenes[0] as Scene;
    expect(verdict.revealedRank).toBeUndefined();
    expect(verdict.verdict).toEqual({ key: 'scene.baron.tie', params: { actorId: 'A', targetId: 'B', rank: 3 } });
  });

  it('keeps the King scene closed when a Countess discard follows a trade (ruling 2)', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 6 }), entry(2, 'choice', { playerId: 'A' })], s));
    const { scenes } = run(
      [
        entry(3, 'king', { playerId: 'A', targetId: 'B' }),
        entry(4, 'discard', { playerId: 'B', rank: 7, reason: 'countess' }),
      ],
      s,
    );
    expect(kinds(scenes)).toEqual(['king', 'simple']);
    expect((scenes[0] as Scene).targetId).toBe('B');
    expect((scenes[0] as Scene).verdict).toEqual({ key: 'scene.king.swapped' });
    expect((scenes[1] as Scene).verdict).toEqual({ key: 'scene.countess.forced', params: { actorId: 'B', rank: 7 } });
  });

  it('shows the peeked card only on the peeker\'s own stream', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 2 }), entry(2, 'choice', { playerId: 'A' })], s));
    const peeker = run([entry(3, 'peek', { playerId: 'A', targetId: 'B', rank: 2 })], s);
    expect((peeker.scenes[0] as Scene).peekRank).toBe(2);
    expect((peeker.scenes[0] as Scene).verdict).toEqual({ key: 'scene.peek.self', params: { targetId: 'B', rank: 2 } });

    let s2 = state();
    ({ state: s2 } = run([entry(1, 'play', { playerId: 'A', rank: 2 }), entry(2, 'choice', { playerId: 'A' })], s2));
    const other = run([entry(3, 'peek', { playerId: 'A', targetId: 'B' })], s2);
    expect((other.scenes[0] as Scene).peekRank).toBeUndefined();
    expect((other.scenes[0] as Scene).verdict).toEqual({ key: 'scene.peek.other', params: { actorId: 'A', targetId: 'B' } });
  });

  it('absorbs a second peek entry for a 2-card target into one scene', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 2 }), entry(2, 'choice', { playerId: 'A' })], s));
    const { scenes } = run(
      [
        entry(3, 'peek', { playerId: 'A', targetId: 'B', rank: 2 }),
        entry(4, 'peek', { playerId: 'A', targetId: 'B', rank: 3 }),
      ],
      s,
    );
    expect(kinds(scenes)).toEqual(['peek']);
    expect((scenes[0] as Scene).peekRank).toBe(3); // the last card seen
  });

  it('folds the Prince target\'s discard into the prince verdict', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 5 }), entry(2, 'choice', { playerId: 'A' })], s));
    const { scenes } = run(
      [
        entry(3, 'prince', { playerId: 'A', targetId: 'B' }),
        entry(4, 'discard', { playerId: 'B', rank: 3, reason: 'prince' }),
      ],
      s,
    );
    expect(kinds(scenes)).toEqual(['prince', 'prince']); // sweep + verdict beat
    expect((scenes[0] as Scene).verdict).toBeUndefined();
    const verdict = scenes[1] as Scene;
    expect(verdict.discardRank).toBe(3);
    expect(verdict.verdict).toEqual({ key: 'scene.prince', params: { targetId: 'B', rank: 3 } });
  });

  it('makes a fizzle its own mini-scene', () => {
    const { scenes } = run([
      entry(1, 'play', { playerId: 'A', rank: 6 }),
      entry(2, 'fizzle', { playerId: 'A', rank: 6 }),
    ]);
    expect(kinds(scenes)).toEqual(['simple']);
    expect(verdicts(scenes)).toEqual(['scene.fizzle']);
  });

  it('makes a forced Countess discard its own mini-scene', () => {
    const { scenes } = run([entry(1, 'discard', { playerId: 'B', rank: 7, reason: 'countess' })]);
    expect(kinds(scenes)).toEqual(['simple']);
    expect(verdicts(scenes)).toEqual(['scene.countess.forced']);
  });

  it('absorbs the princess-player\'s own reveal and eliminate', () => {
    const { scenes } = run([
      entry(1, 'play', { playerId: 'A', rank: 8 }),
      entry(2, 'reveal', { playerId: 'A', rank: 3 }),
      entry(3, 'eliminate', { playerId: 'A', reason: 'princess' }),
    ]);
    expect(kinds(scenes)).toEqual(['simple']);
    expect((scenes[0] as Scene).revealedRank).toBe(3);
    expect(verdicts(scenes)).toEqual(['scene.princess']);
  });

  it('skips deck-empty round reveals (the banner is the beat) but banners the round', () => {
    const first = run([entry(1, 'play', { playerId: 'A', rank: 4 })]);
    expect(kinds(first.scenes)).toEqual(['simple']); // the handmaid scene played on its own batch
    const { scenes } = run(
      [
        entry(2, 'reveal', { playerId: 'A', rank: 5 }),
        entry(3, 'reveal', { playerId: 'B', rank: 2 }),
        entry(4, 'round', { winners: ['A'], reason: 'highest-hand' }),
      ],
      first.state,
    );
    expect(kinds(scenes)).toEqual(['banner']); // no standalone reveal flashes
    expect(scenes[0]).toEqual({ key: 's4', kind: 'banner', text: 'banner text' });
  });

  it('does not leak round-ending reveals into a hit guard scene (guard hit + deck empty)', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 1 }), entry(2, 'choice', { playerId: 'A' })], s));
    const { scenes } = run(
      [
        entry(3, 'guard', { playerId: 'A', targetId: 'B', rank: 8 }),
        entry(4, 'reveal', { playerId: 'B', rank: 8 }), // the guard's consequence
        entry(5, 'eliminate', { playerId: 'B', reason: 'guard' }),
        entry(6, 'reveal', { playerId: 'C', rank: 6 }), // the deck-empty round end
        entry(7, 'reveal', { playerId: 'D', rank: 2 }),
        entry(8, 'round', { winners: ['C'], reason: 'highest-hand' }),
      ],
      s,
    );
    expect(kinds(scenes)).toEqual(['guard', 'guard', 'banner']); // sweep, hit verdict, banner
    const sweep = scenes[0] as Scene;
    const verdict = scenes[1] as Scene;
    expect(sweep.verdict).toBeUndefined();
    expect(verdict.revealedRank).toBe(8);
    expect(verdict.revealedAt).toBe('B');
    expect(verdict.verdict).toEqual({ key: 'scene.guard.hit', params: { targetId: 'B', rank: 8 } });
  });

  it('flashes a standalone reveal (a fold or leave) with no caption', () => {
    const fold = run([
      entry(1, 'info', { what: 'choiceAbandoned', playerId: 'A' }),
      entry(2, 'reveal', { playerId: 'B', rank: 6 }),
      entry(3, 'eliminate', { playerId: 'B', reason: 'fold' }),
    ]);
    expect(kinds(fold.scenes)).toEqual(['reveal']);
    const scene = fold.scenes[0] as Scene;
    expect(scene.verdict).toBeUndefined();
    expect(scene).toMatchObject({ kind: 'reveal', actorId: 'B', playedRank: 6 });
  });

  it('banners round and match endings with localized text', () => {
    const round = run([entry(1, 'round', { winners: ['A'], reason: 'last-standing' })]);
    expect(round.scenes).toEqual([{ key: 's1', kind: 'banner', text: 'banner text' }]);
    const match = run([entry(1, 'match', { winnerId: 'A' })]);
    expect(match.scenes[0]).toEqual({ key: 's1', kind: 'banner', text: 'banner text' });
  });

  it('never animates informational, join/leave, or choice lines', () => {
    for (const e of [
      entry(1, 'choice', { playerId: 'A' }),
      entry(2, 'join', { playerId: 'B' }),
      entry(3, 'leave', { playerId: 'B' }),
      entry(4, 'info', { what: 'roomCreated', roomCode: 'ABCD' }),
      entry(5, 'info', { what: 'roundStarted', roundNumber: 1 }),
    ]) {
      const { scenes } = run([e]);
      expect(scenes, e.kind).toEqual([]);
    }
  });

  it('drops a dangling pending scene silently when the next play arrives (defensive)', () => {
    let s = state();
    ({ state: s } = run([entry(1, 'play', { playerId: 'A', rank: 1 })], s));
    const { scenes } = run([entry(2, 'play', { playerId: 'B', rank: 4 })], s);
    expect(kinds(scenes)).toEqual(['simple']);
    expect(scenes.length).toBe(1);
  });

  it('does not emit a resolution without a pending scene and no cache (defensive)', () => {
    const { scenes } = run([entry(1, 'baron', { playerId: 'A', targetId: 'B' })]);
    expect(scenes).toEqual([]);
  });
});

describe('sceneStages (ticket 23) — three-step decomposition', () => {
  it('plays a Guard sweep (with the accusation tag) then a hit verdict', () => {
    const sweep: Scene = {
      key: 's1',
      kind: 'guard',
      actorId: 'A',
      targetId: 'B',
      playedRank: 1,
      guessRank: 8,
      tag: { key: 'scene.guard.accuses', params: { actorId: 'A', targetId: 'B', rank: 8 } },
    };
    const sweepStages = sceneStages(sweep, loc);
    expect(sweepStages).toHaveLength(1);
    expect(sweepStages[0]!.els).toContainEqual({ kind: 'fly', rank: 1, from: 'A', via: 'B', to: 'A', toPile: true });
    expect(sweepStages[0]!.els).toContainEqual({ kind: 'tag', text: 'Alice accuses Bob of the Princess?', at: 'B' });

    const verdict: Scene = {
      key: 's2',
      kind: 'guard',
      actorId: 'A',
      targetId: 'B',
      playedRank: 1,
      guessRank: 8,
      revealedRank: 8,
      revealedAt: 'B',
      verdict: { key: 'scene.guard.hit', params: { targetId: 'B', rank: 8 } },
    };
    const verdictStages = sceneStages(verdict, loc);
    expect(verdictStages).toHaveLength(2);
    expect(verdictStages[0]!.els).toEqual([{ kind: 'flash', rank: 8, at: 'B' }]);
    expect(verdictStages[1]!.els).toEqual([{ kind: 'caption', text: 'Hit! Bob had the Princess' }]);
    expect(verdictStages[1]!.ms).toBeGreaterThanOrEqual(1500); // the ~1.5s verdict hold
  });

  it('plays a Guard miss without a flash', () => {
    const verdict: Scene = {
      key: 's2',
      kind: 'guard',
      actorId: 'A',
      targetId: 'B',
      playedRank: 1,
      guessRank: 8,
      verdict: { key: 'scene.guard.miss', params: { targetId: 'B', rank: 8 } },
    };
    const stages = sceneStages(verdict, loc);
    expect(stages).toHaveLength(1);
    expect(stages[0]!.els).toEqual([{ kind: 'caption', text: 'No — Bob didn\'t have the Princess' }]);
  });

  it('flashes both Baron cards side by side when the target loses', () => {
    const sweep: Scene = { key: 's1', kind: 'baron', actorId: 'A', targetId: 'B', playedRank: 3 };
    const sweepStages = sceneStages(sweep, loc);
    expect(sweepStages[0]!.els).toEqual([{ kind: 'fly', rank: 3, from: 'A', via: 'B', to: 'A', toPile: true }]);

    const verdict: Scene = {
      key: 's2',
      kind: 'baron',
      actorId: 'A',
      targetId: 'B',
      playedRank: 3,
      revealedRank: 1,
      revealedAt: 'B',
      verdict: { key: 'scene.baron.vs', params: { actorId: 'A', rankA: 3, targetId: 'B', rankB: 1 } },
    };
    const stages = sceneStages(verdict, loc);
    expect(stages).toHaveLength(2);
    expect(stages[0]!.els).toEqual([{ kind: 'pair', rankA: 3, atA: 'A', rankB: 1, atB: 'B' }]);
    expect(stages[1]!.els).toEqual([{ kind: 'caption', text: 'Alice\'s Baron vs Bob\'s Guard' }]);
  });

  it('flashes only the actor\'s card when the Baron backfires', () => {
    const verdict: Scene = {
      key: 's2',
      kind: 'baron',
      actorId: 'A',
      targetId: 'B',
      playedRank: 3,
      revealedRank: 7,
      revealedAt: 'A',
      verdict: { key: 'scene.baron.backfire', params: { actorId: 'A', rank: 7 } },
    };
    const stages = sceneStages(verdict, loc);
    expect(stages[0]!.els).toEqual([{ kind: 'flash', rank: 7, at: 'A' }]);
  });

  it('crosses two card backs for the King swap after the King plays to the pile', () => {
    const scene: Scene = {
      key: 's1',
      kind: 'king',
      actorId: 'A',
      targetId: 'B',
      playedRank: 6,
      verdict: { key: 'scene.king.swapped' },
    };
    const stages = sceneStages(scene, loc);
    expect(stages).toHaveLength(3);
    expect(stages[0]!.els).toEqual([{ kind: 'fly', rank: 6, from: 'A', to: 'A', toPile: true }]); // no via — plays to the pile first
    expect(stages[1]!.els).toEqual([
      { kind: 'backFly', from: 'A', to: 'B' },
      { kind: 'backFly', from: 'B', to: 'A' },
    ]);
    expect(stages[2]!.els).toEqual([{ kind: 'caption', text: 'Hands swapped' }]);
  });

  it('shows the peeked card on the peeker\'s stages but not others\'', () => {
    const peeker: Scene = {
      key: 's1',
      kind: 'peek',
      actorId: 'A',
      targetId: 'B',
      playedRank: 2,
      peekRank: 2,
      verdict: { key: 'scene.peek.self', params: { targetId: 'B', rank: 2 } },
    };
    const peekerStages = sceneStages(peeker, loc);
    expect(peekerStages[0]!.els).toEqual([{ kind: 'fly', rank: 2, from: 'A', via: 'B', to: 'A', toPile: true }]);
    expect(peekerStages[1]!.els).toEqual([{ kind: 'flash', rank: 2, at: 'B' }]);
    expect(peekerStages[2]!.els).toEqual([{ kind: 'caption', text: 'You saw Bob\'s Priest' }]);

    const other: Scene = {
      key: 's1',
      kind: 'peek',
      actorId: 'A',
      targetId: 'B',
      playedRank: 2,
      verdict: { key: 'scene.peek.other', params: { actorId: 'A', targetId: 'B' } },
    };
    const otherStages = sceneStages(other, loc);
    expect(otherStages).toHaveLength(2); // no card flash — the peek happens unseen
    expect(otherStages[1]!.els).toEqual([{ kind: 'caption', text: 'Alice peeked at Bob' }]);
  });

  it('flies the Prince sweep first, then the target\'s discard with the verdict', () => {
    const sweep: Scene = { key: 's1', kind: 'prince', actorId: 'A', targetId: 'B', playedRank: 5 };
    const sweepStages = sceneStages(sweep, loc);
    expect(sweepStages[0]!.els).toEqual([{ kind: 'fly', rank: 5, from: 'A', via: 'B', to: 'A', toPile: true }]);

    const verdict: Scene = {
      key: 's2',
      kind: 'prince',
      actorId: 'A',
      targetId: 'B',
      playedRank: 5,
      discardRank: 3,
      verdict: { key: 'scene.prince', params: { targetId: 'B', rank: 3 } },
    };
    const stages = sceneStages(verdict, loc);
    expect(stages[0]!.els).toEqual([{ kind: 'fly', rank: 3, from: 'B', to: 'B', toPile: true }]);
    expect(stages[1]!.els).toEqual([{ kind: 'caption', text: 'Bob discards the Baron' }]);
  });

  it('renders "You" for the viewer\'s own seat in captions', () => {
    const scene: Scene = {
      key: 's1',
      kind: 'simple',
      actorId: 'C',
      playedRank: 4,
      verdict: { key: 'scene.handmaid', params: { actorId: 'C' } },
    };
    const stages = sceneStages(scene, loc); // loc.selfId is 'C'
    expect(stages[0]!.els).toEqual([{ kind: 'fly', rank: 4, from: 'C', to: 'C', toPile: true }]);
    expect(stages[1]!.els).toEqual([{ kind: 'caption', text: 'You are protected' }]);
  });

  it('flashes a standalone reveal with no caption', () => {
    const scene: Scene = { key: 's1', kind: 'reveal', actorId: 'B', playedRank: 6 };
    const stages = sceneStages(scene, loc);
    expect(stages).toEqual([{ els: [{ kind: 'flash', rank: 6, at: 'B' }], ms: 900 }]);
  });

  it('renders every remaining verdict caption without leftover placeholders', () => {
    const cases: Array<{ scene: Scene; en: string }> = [
      {
        scene: { key: 's1', kind: 'baron', actorId: 'A', targetId: 'B', playedRank: 3, verdict: { key: 'scene.baron.tie', params: { actorId: 'A', targetId: 'B', rank: 3 } } },
        en: "Alice's Baron ties Bob",
      },
      {
        scene: { key: 's2', kind: 'simple', actorId: 'A', playedRank: 7, verdict: { key: 'scene.countess.forced', params: { actorId: 'A', rank: 7 } } },
        en: 'Alice discards the Countess (forced)',
      },
      {
        scene: { key: 's3', kind: 'simple', actorId: 'A', playedRank: 8, verdict: { key: 'scene.princess', params: { actorId: 'A' } } },
        en: 'Alice is out',
      },
      {
        scene: { key: 's4', kind: 'simple', actorId: 'C', playedRank: 8, verdict: { key: 'scene.princess', params: { actorId: 'C' } } },
        en: 'You are out',
      },
      {
        scene: { key: 's5', kind: 'simple', actorId: 'C', playedRank: 1, verdict: { key: 'scene.fizzle', params: { actorId: 'C', rank: 1 } } },
        en: 'Your Guard had no target',
      },
      {
        scene: { key: 's6', kind: 'peek', actorId: 'A', targetId: 'B', playedRank: 2, verdict: { key: 'scene.peek.other', params: { actorId: 'A', targetId: 'B' } } },
        en: 'Alice peeked at Bob',
      },
    ];
    for (const { scene, en } of cases) {
      const last = sceneStages(scene, loc).at(-1)!;
      expect(last.els).toEqual([{ kind: 'caption', text: en }]);
    }
  });
});
