import { describe, expect, it } from 'vitest';
import { apply, buildView, reduceView } from '../src/index.js';
import type { Event, GameState, ViewState } from '../src/index.js';
import { assertInvariants, randomIntent } from './sim.js';
import { seededRng } from './helpers.js';

const MAX_STEPS = 5000;

/** The server's privacy filter, mirrored: private cards reach only their owner. */
function filtered(event: Event, viewerId: string): Event {
  if (
    (event.type === 'cardDealt' || event.type === 'cardDrawn' || event.type === 'handPeeked')
    && event.playerId !== viewerId
  ) {
    return { ...event, card: null };
  }
  if (event.type === 'handTraded' && event.playerId !== viewerId) {
    return { ...event, cards: null };
  }
  return event;
}

/**
 * Drive a full match, folding every event into every player's view exactly as
 * a live client would (privacy-filtered), and assert after every fold that
 * the viewer's hand — contents AND order — matches the engine's authoritative
 * hand, and that the public hand count matches its length. Any future view
 * desync (a trade payload, an order drift, a dropped fold) fails here.
 */
function viewSyncProbe(seed: number, capacity: 2 | 3 | 4): number {
  const rng = seededRng(seed);
  let folds = 0;

  let res = apply(null, { type: 'createRoom', roomCode: 'VSYN', capacity, playerId: 'A', playerName: 'Alice' }, rng);
  if (!res.ok) throw new Error(`createRoom failed: ${res.error}`);
  let state: GameState = res.state;
  let views: Map<string, ViewState> = new Map([['A', buildView(state, 'A')]]);
  // The server applies each intent atomically; a live client folds the batch
  // one event per socket frame, so the view only reaches the post-batch hand
  // after the last event. The at-rest invariant — the moment any click can
  // land — is: after the batch is fully folded, every view hand equals the
  // engine hand, in contents and order, and the public count matches.
  const foldBatch = (events: readonly Event[]) => {
    for (const e of events) {
      for (const [pid, view] of views) {
        const next = reduceView(view, filtered(e, pid), pid);
        if (next === null) throw new Error('view died');
        views.set(pid, next);
      }
    }
    for (const [pid, view] of views) {
      const player = state.players.find((p) => p.id === pid)!;
      expect(view.hand).toEqual(player.hand);
      expect(view.players.find((x) => x.id === pid)!.handCount).toBe(player.hand.length);
      folds += 1;
    }
  };
  foldBatch(res.events);
  let steps = 1;
  const names = ['Bob', 'Carol', 'Dave'];
  for (let i = 0; i < capacity - 1; i++) {
    res = apply(state, { type: 'joinRoom', playerId: String.fromCharCode(66 + i), playerName: names[i]! }, rng);
    if (!res.ok) throw new Error(`joinRoom failed: ${res.error}`);
    state = res.state;
    views.set(String.fromCharCode(66 + i), buildView(state, String.fromCharCode(66 + i)));
    foldBatch(res.events);
    steps += 1;
  }

  while (state.phase !== 'matchEnded') {
    const intent = randomIntent(state, rng);
    res = apply(state, intent, rng);
    if (!res.ok) throw new Error(`legal intent rejected: ${JSON.stringify(intent)} → ${res.error}`);
    state = res.state;
    assertInvariants(state, res.events);
    foldBatch(res.events);
    steps += 1;
    if (steps > MAX_STEPS) throw new Error(`match did not terminate after ${MAX_STEPS} steps`);
  }
  return folds;
}

describe('view/server hand sync (ticket 30 regression)', () => {
  it('every player’s view hand equals the engine hand after every fold, through real matches', { timeout: 60_000 }, () => {
    let folds = 0;
    for (let seed = 1; seed <= 15; seed++) {
      for (const cap of [2, 3, 4] as const) folds += viewSyncProbe(seed, cap);
    }
    // Sanity: the probe actually folded a large number of events.
    expect(folds).toBeGreaterThan(10_000);
  });
});
