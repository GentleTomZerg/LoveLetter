/**
 * Scene derivation (ticket 23, reworked by ticket 26) — the pure seam under
 * the play animations. Fresh log entries correlate into one **scene per
 * play** that ends with the outcome, following the same three-step template —
 * Use (the card lifts from the actor's hand) → Travel & archive (targeting
 * cards sweep toward the target, then settle into the actor's discard pile;
 * non-targeting cards fly straight to the pile) → Effect (the outcome beat
 * with a short verdict caption, ~1.5s hold). The renderer (`PlayScenes`)
 * turns each scene into concrete beats via `sceneStages`.
 *
 * Ticket 26 makes the verdict **data, not inference**: every resolution now
 * ends with an explicit completion event (`guardMissed` / `baronTied`, or the
 * existing reveal/discard/peek), so no outcome is ever "complete but silent".
 * The old split machinery is gone — no `resolving` state, no `emitVerdict`
 * clone, no `forceVerdict`, no deck-empty lookahead. A targeting play opens a
 * **pending** scene on its `play` entry (the choice can take seconds); its
 * resolution marker (`guard`/`baron`/`prince` log entries) fills in the
 * facts and emits nothing; the completion entry (the `miss`/`tie`/`reveal`/
 * `discard` that follows in the same apply burst, one frame later) emits the
 * **whole scene with its verdict known**. The sweep starts one frame later
 * than before — imperceptible — and every targeting scene is one scene again.
 *
 * The client folds one event per socket frame, so the marker and its
 * completion arrive in separate batches; the pending handoff carries the
 * facts across that frame. The King (its trade has no log entry) and the
 * Priest (its `peek` entry is marker and completion in one) still emit whole
 * at their single entry, as before.
 *
 * Privacy: the scene carries only what the viewer's own log shows. The
 * peeked card is present only on the Priest's chooser's stream; a wrong
 * Guard guess reveals nothing, so the miss verdict says the target *didn't*
 * have the card (the engine never reveals the real card on a miss). Seats
 * never fly — elimination dims the seat through the existing out-state
 * transition (ADR-0007).
 */

import type { LogEntry, Rank } from '@love-letter/core';
import type { MessageKey, TParams } from './i18n';

/**
 * A localized caption for a scene beat — a typed key plus the facts the
 * renderer needs to resolve names/cards in the viewer's locale. The key set
 * lives in `messages.ts`, so zh completeness is a compile error (ADR-0004).
 */
export type SceneCaption =
  | { key: 'scene.guard.accuses'; params: { actorId: string; targetId: string; rank: Rank } }
  | { key: 'scene.guard.hit'; params: { targetId: string; rank: Rank } }
  | { key: 'scene.guard.miss'; params: { targetId: string; rank: Rank } }
  | { key: 'scene.baron.vs'; params: { actorId: string; rankA: Rank; targetId: string; rankB: Rank } }
  | { key: 'scene.baron.backfire'; params: { actorId: string; rank: Rank } }
  | { key: 'scene.baron.tie'; params: { actorId: string; targetId: string; rank: Rank } }
  | { key: 'scene.king.swapped' }
  | { key: 'scene.peek.self'; params: { targetId: string; rank: Rank } }
  | { key: 'scene.peek.other'; params: { actorId: string; targetId: string } }
  | { key: 'scene.handmaid'; params: { actorId: string } }
  | { key: 'scene.prince'; params: { targetId: string; rank: Rank } }
  | { key: 'scene.countess'; params: { actorId: string; rank: Rank } }
  | { key: 'scene.countess.forced'; params: { actorId: string; rank: Rank } }
  | { key: 'scene.princess'; params: { actorId: string } }
  | { key: 'scene.fizzle'; params: { actorId: string; rank: Rank } };

/**
 * One correlated play, as derived from the viewer's log. `kind` picks the
 * effect beat; the optional facts feed it (the target's revealed card, the
 * Prince's discard, the peeked card on the peeker's own stream). `simple`
 * covers non-targeting plays (handmaid/countess/princess) and fizzles —
 * the verdict key distinguishes them. `reveal` is a standalone hand reveal
 * (a fold or a leave), flashed with no caption.
 */
export interface Scene {
  key: string;
  kind: 'guard' | 'baron' | 'king' | 'peek' | 'prince' | 'simple' | 'reveal';
  /** The actor — who played the card that opens the scene. */
  actorId: string;
  /** The played card's rank — the "use" beat's art. */
  playedRank: Rank;
  /** Targeting scenes only. */
  targetId?: string;
  /** Guard: the guessed rank (the accuses tag + miss comparison). */
  guessRank?: Rank;
  /** The revealed rank and where it sits (guard hit, baron loser, the
   *  princess-player's own remaining card). */
  revealedRank?: Rank;
  revealedAt?: string;
  /** Prince: the target's first discarded rank. */
  discardRank?: Rank;
  /** Peek: the peeked rank — only the peeker's own stream carries it. */
  peekRank?: Rank;
  /** Guard's accuses tag, shown at the target during the sweep. */
  tag?: SceneCaption;
  /** The verdict caption for the effect beat — every scene now carries one
   *  (ticket 26: the verdict arrives as data, never inferred). */
  verdict?: SceneCaption;
}

/** A round/match win — a centered banner that always follows the final scene. */
export interface Banner {
  kind: 'banner';
  key: string;
  text: string;
}

export type SceneOrBanner = Scene | Banner;

/** The builder's memory across batches. */
export interface SceneState {
  /** Next scene key number (unique per client). */
  seq: number;
  /** The last card each player played (public) — art for a defensive
   *  resolution fallback when no pending scene exists. */
  lastPlayed: Record<string, Rank>;
  /** A targeting play awaiting its completion entry: opened by the `play`
   *  entry, filled in by the resolution marker, emitted whole when the
   *  completion (miss/tie/reveal/discard) arrives — one frame later, in the
   *  same apply burst (ticket 26). Never finalized by absence. */
  pending: PendingScene | null;
}

/** A targeting play awaiting its completion entry. */
interface PendingScene {
  kind: 'guard' | 'peek' | 'baron' | 'prince' | 'king';
  actorId: string;
  playedRank: Rank;
  /** Filled in by the resolution marker (the choice's target). */
  targetId?: string;
  /** Guard only: the guessed rank, from the marker. */
  guessRank?: Rank;
}

export const initialSceneState = (): SceneState => ({ seq: 0, lastPlayed: {}, pending: null });

/** Ranks whose play resolves against a target (Guard/Priest/Baron/Prince/King). */
const TARGETING: Record<1 | 2 | 3 | 5 | 6, PendingScene['kind']> = {
  1: 'guard',
  2: 'peek',
  3: 'baron',
  5: 'prince',
  6: 'king',
};

const isTargeting = (rank: Rank): rank is 1 | 2 | 3 | 5 | 6 =>
  rank === 1 || rank === 2 || rank === 3 || rank === 5 || rank === 6;

/** The Guard's accusation tag (shown at the target during the sweep). */
const guardTag = (p: PendingScene): SceneCaption => ({
  key: 'scene.guard.accuses',
  params: { actorId: p.actorId, targetId: p.targetId ?? p.actorId, rank: p.guessRank ?? p.playedRank },
});

/**
 * Map a batch of fresh log entries to scenes (zero or more) and the next
 * state. `fmt` localizes banner text (round/match lines); it is only called
 * for banner entries. A targeting play opens a pending scene (no scene yet);
 * its resolution marker fills the facts; the completion entry emits the whole
 * scene — the three can arrive in different batches.
 */
export function scenesFor(fresh: LogEntry[], state: SceneState, fmt: (entry: LogEntry) => string): {
  state: SceneState;
  scenes: SceneOrBanner[];
} {
  let seq = state.seq;
  let lastPlayed = { ...state.lastPlayed };
  let pending = state.pending;
  const scenes: SceneOrBanner[] = [];
  /** The emitted scene absorbing same-batch consequences (a second peek
   *  entry, a second Prince discard, the princess-player's own reveal). */
  let open: Scene | null = null;

  const nextKey = () => `s${++seq}`;

  const closeOpen = () => {
    open = null;
  };

  for (let i = 0; i < fresh.length; i++) {
    const entry = fresh[i]!;
    const { params } = entry;
    const playerId = params.playerId as string | undefined;
    const targetId = params.targetId as string | undefined;
    const entryRank = params.rank as Rank | undefined;
    const remaining = fresh.slice(i + 1);

    switch (entry.kind) {
      case 'play': {
        // Any pending scene was never completed (defensive — a play always
        // follows the previous resolution) — drop it silently.
        pending = null;
        closeOpen();
        if (playerId !== undefined && entryRank !== undefined) {
          lastPlayed = { ...lastPlayed, [playerId]: entryRank };
          if (isTargeting(entryRank)) {
            pending = { kind: TARGETING[entryRank], actorId: playerId, playedRank: entryRank };
          } else {
            const scene: Scene = {
              key: nextKey(),
              kind: 'simple',
              actorId: playerId,
              playedRank: entryRank,
              verdict: simpleVerdict(entryRank, playerId),
            };
            scenes.push(scene);
            open = scene;
          }
        }
        break;
      }

      case 'fizzle':
        // A targeting card with no legal target — its own mini-scene.
        closeOpen();
        if (pending !== null) {
          const scene: Scene = {
            key: nextKey(),
            kind: 'simple',
            actorId: pending.actorId,
            playedRank: pending.playedRank,
            verdict: { key: 'scene.fizzle', params: { actorId: pending.actorId, rank: pending.playedRank } },
          };
          scenes.push(scene);
          open = scene;
          pending = null;
        } else if (playerId !== undefined && entryRank !== undefined) {
          const scene: Scene = {
            key: nextKey(),
            kind: 'simple',
            actorId: playerId,
            playedRank: entryRank,
            verdict: { key: 'scene.fizzle', params: { actorId: playerId, rank: entryRank } },
          };
          scenes.push(scene);
          open = scene;
        }
        break;

      case 'choice':
        // The actor is picking a target — informational; the scene waits.
        break;

      case 'guard':
      case 'baron':
      case 'prince': {
        // The resolution marker: fill in the held scene's facts and emit
        // nothing — the completion entry (miss/tie/reveal/discard) emits the
        // whole scene with its verdict (ticket 26).
        closeOpen();
        if (playerId === undefined || targetId === undefined) break;
        const played = pending !== null && pending.kind === entry.kind ? pending.playedRank : lastPlayed[playerId];
        if (played === undefined) break; // no art — nothing to show (defensive)
        pending = { kind: entry.kind, actorId: playerId, playedRank: played, targetId };
        if (entry.kind === 'guard' && entryRank !== undefined) pending.guessRank = entryRank;
        break;
      }

      case 'king':
        // The King knows its outcome at the marker (the trade has no log
        // entry of its own) — emit whole here, as before.
        closeOpen();
        if (playerId === undefined || targetId === undefined) break;
        {
          const played = pending !== null && pending.kind === 'king' ? pending.playedRank : lastPlayed[playerId];
          if (played === undefined) break;
          pending = null;
          const scene: Scene = {
            key: nextKey(),
            kind: 'king',
            actorId: playerId,
            targetId,
            playedRank: played,
            verdict: { key: 'scene.king.swapped' },
          };
          scenes.push(scene);
          open = scene;
        }
        break;

      case 'peek': {
        // The Priest's peek entry is marker and completion in one. A second
        // peek entry for the same hand (a 2-card target) folds into the open
        // peek scene instead of starting a new one.
        if (
          open !== null && open.kind === 'peek'
          && open.actorId === playerId && open.targetId === targetId
        ) {
          if (entryRank !== undefined) open.peekRank = entryRank;
          break;
        }
        closeOpen();
        if (playerId === undefined || targetId === undefined) break;
        const played = pending !== null && pending.kind === 'peek' ? pending.playedRank : lastPlayed[playerId];
        if (played === undefined) break;
        pending = null;
        const scene: Scene = { key: nextKey(), kind: 'peek', actorId: playerId, targetId, playedRank: played };
        // The peeker's own stream carries the card — the self verdict; a
        // viewer without it sees the peek happen with no card.
        scene.verdict =
          entryRank !== undefined
            ? { key: 'scene.peek.self', params: { targetId, rank: entryRank } }
            : { key: 'scene.peek.other', params: { actorId: playerId, targetId } };
        if (entryRank !== undefined) scene.peekRank = entryRank;
        scenes.push(scene);
        open = scene;
        break;
      }

      case 'miss':
        // The Guard's completion (ticket 26): the guess missed — the held
        // guard scene emits whole with the miss verdict, no reveal.
        if (
          pending !== null && pending.kind === 'guard'
          && pending.actorId === playerId && targetId !== undefined && pending.targetId === targetId
        ) {
          const scene: Scene = {
            key: nextKey(),
            kind: 'guard',
            actorId: pending.actorId,
            targetId,
            playedRank: pending.playedRank,
            guessRank: pending.guessRank ?? entryRank ?? pending.playedRank,
            tag: guardTag(pending),
            verdict: {
              key: 'scene.guard.miss',
              params: { targetId, rank: pending.guessRank ?? entryRank ?? pending.playedRank },
            },
          };
          scenes.push(scene);
          open = scene;
          pending = null;
        }
        break;

      case 'tie':
        // The Baron's completion (ticket 26): equal hands — the held baron
        // scene emits whole with the tie verdict, no reveal.
        if (
          pending !== null && pending.kind === 'baron'
          && pending.actorId === playerId && targetId !== undefined && pending.targetId === targetId
        ) {
          const scene: Scene = {
            key: nextKey(),
            kind: 'baron',
            actorId: pending.actorId,
            targetId,
            playedRank: pending.playedRank,
            verdict: {
              key: 'scene.baron.tie',
              params: { actorId: pending.actorId, targetId, rank: pending.playedRank },
            },
          };
          scenes.push(scene);
          open = scene;
          pending = null;
        }
        break;

      case 'reveal': {
        const hasEliminate = remaining.some((e) => e.kind === 'eliminate');
        const endsRound = remaining.some((e) => e.kind === 'round' || e.kind === 'match');
        // A reveal matching the held guard/baron scene decides its outcome:
        // the guard's target was hit, the baron's target lost, or (playerId
        // = the actor) the baron backfired.
        if (pending !== null && playerId !== undefined && entryRank !== undefined) {
          const target = pending.targetId;
          if (pending.kind === 'guard' && target !== undefined && playerId === target) {
            const scene: Scene = {
              key: nextKey(),
              kind: 'guard',
              actorId: pending.actorId,
              targetId: target,
              playedRank: pending.playedRank,
              guessRank: pending.guessRank ?? pending.playedRank,
              tag: guardTag(pending),
              revealedRank: entryRank,
              revealedAt: playerId,
              verdict: { key: 'scene.guard.hit', params: { targetId: target, rank: entryRank } },
            };
            scenes.push(scene);
            open = scene;
            pending = null;
            break;
          }
          if (pending.kind === 'baron' && target !== undefined && (playerId === target || playerId === pending.actorId)) {
            const backfire = playerId === pending.actorId;
            const scene: Scene = {
              key: nextKey(),
              kind: 'baron',
              actorId: pending.actorId,
              targetId: target,
              playedRank: pending.playedRank,
              revealedRank: entryRank,
              revealedAt: playerId,
              verdict: backfire
                ? { key: 'scene.baron.backfire', params: { actorId: pending.actorId, rank: entryRank } }
                : {
                  key: 'scene.baron.vs',
                  params: { actorId: pending.actorId, rankA: pending.playedRank, targetId: target, rankB: entryRank },
                },
            };
            scenes.push(scene);
            open = scene;
            pending = null;
            break;
          }
        }
        if (open !== null && playerId !== undefined && entryRank !== undefined && hasEliminate) {
          // The princess-player's own hand reveal — absorbed into her scene.
          open.revealedRank = entryRank;
          open.revealedAt = playerId;
          break;
        }
        closeOpen();
        if (endsRound) break; // the deck-empty round end — the banner is the beat
        if (playerId !== undefined && entryRank !== undefined) {
          // A fold or leave reveals the player's hand — a standalone flash.
          const scene: Scene = { key: nextKey(), kind: 'reveal', actorId: playerId, playedRank: entryRank };
          scenes.push(scene);
          open = scene;
        }
        break;
      }

      case 'eliminate':
        // The outcome — the view dims the seat through the out-state
        // transition; the scene already carried the reveal it pairs with.
        break;

      case 'discard': {
        const reason = params.reason as string | undefined;
        if (reason === 'prince') {
          const target = pending?.targetId;
          if (pending !== null && pending.kind === 'prince' && target !== undefined && target === playerId && entryRank !== undefined) {
            // The Prince's target discards — this decides the prince verdict.
            const scene: Scene = {
              key: nextKey(),
              kind: 'prince',
              actorId: pending.actorId,
              targetId: target,
              playedRank: pending.playedRank,
              discardRank: entryRank,
              verdict: { key: 'scene.prince', params: { targetId: target, rank: entryRank } },
            };
            scenes.push(scene);
            open = scene;
            pending = null;
            break;
          }
          if (open !== null && open.kind === 'prince') break; // a second card of the same forced discard
        }
        closeOpen();
        if (playerId !== undefined && entryRank !== undefined) {
          // The forced Countess (after a draw or a King trade) is its own
          // mini-scene; any stray discard (defensive) flies the same way.
          const scene: Scene = {
            key: nextKey(),
            kind: 'simple',
            actorId: playerId,
            playedRank: entryRank,
            verdict: {
              key: reason === 'countess' ? 'scene.countess.forced' : 'scene.countess',
              params: { actorId: playerId, rank: entryRank },
            },
          };
          scenes.push(scene);
          open = scene;
        }
        break;
      }

      case 'round':
      case 'match':
        closeOpen();
        pending = null;
        scenes.push({ key: nextKey(), kind: 'banner', text: fmt(entry) });
        break;

      case 'info':
        // roundStarted / rematchStarted / choiceAbandoned — boundaries.
        closeOpen();
        pending = null;
        break;

      case 'join':
      case 'leave':
        // No animation — seats join/leave as text.
        break;
    }
  }

  return { state: { seq, lastPlayed, pending }, scenes };
}

/** The verdict for a non-targeting play (handmaid/countess/princess). */
function simpleVerdict(rank: Rank, actorId: string): SceneCaption {
  switch (rank) {
    case 4:
      return { key: 'scene.handmaid', params: { actorId } };
    case 7:
      return { key: 'scene.countess', params: { actorId, rank } };
    case 8:
      return { key: 'scene.princess', params: { actorId } };
    default:
      // Defensive — a stray non-targeting rank.
      return { key: 'scene.fizzle', params: { actorId, rank } };
  }
}

// ---------------------------------------------------------------------------
// Beat decomposition (pure): one scene → its three-step stages
// ---------------------------------------------------------------------------

/** A scene beat's element — everything the renderer draws for one stage. */
export type StageEl =
  | { kind: 'fly'; rank: Rank; from: string; to: string; via?: string; toPile: boolean }
  | { kind: 'backFly'; from: string; to: string }
  | { kind: 'flash'; rank: Rank; at: string }
  /** Two cards flash side by side (the Baron comparison). */
  | { kind: 'pair'; rankA: Rank; atA: string; rankB: Rank; atB: string }
  /** A short tag at a seat (the Guard's accusation). */
  | { kind: 'tag'; text: string; at: string }
  /** The verdict caption — centered, held ~1.5s. */
  | { kind: 'caption'; text: string };

/** One stage of a scene — its elements play concurrently for `ms`. */
export interface Stage {
  els: StageEl[];
  ms: number;
}

/** How the renderer resolves names/cards for scene captions. */
export interface SceneLoc {
  selfId: string;
  /** Every player who ever joined, id → name — captions show names, never ids. */
  roster: Record<string, string>;
  t: (key: MessageKey, params?: TParams) => string;
  cardName: (rank: Rank) => string;
}

export const STAGE_MS = {
  fly: 1000, // use + travel & archive
  flyDirect: 900, // no waypoint — straight to the pile
  flash: 900,
  pair: 1200,
  backFly: 900,
  caption: 1500, // the verdict hold
  banner: 2200,
} as const;

const name = (loc: SceneLoc, id: string) =>
  id === loc.selfId ? loc.t('common.you') : (loc.roster[id] ?? id);
const card = (loc: SceneLoc, rank: Rank) => loc.cardName(rank);
const isSelf = (loc: SceneLoc, id: string) => id === loc.selfId;

/**
 * Render a caption in the viewer's locale. English needs a distinct form
 * when the viewer is the actor or target ("You are protected" vs "Alice is
 * protected", "Your Guard had no target" vs "Alice's Guard…") — the self
 * keys ship alongside the base ones and zh reuses the grammar-neutral base.
 */
function captionText(loc: SceneLoc, cap: SceneCaption): string {
  switch (cap.key) {
    case 'scene.guard.accuses': {
      const { actorId, targetId, rank } = cap.params;
      const params = { target: name(loc, targetId), card: card(loc, rank) };
      return isSelf(loc, actorId)
        ? loc.t('scene.guard.accuses.self', params)
        : loc.t(cap.key, { actor: name(loc, actorId), ...params });
    }
    case 'scene.guard.hit':
    case 'scene.guard.miss':
      return loc.t(cap.key, { target: name(loc, cap.params.targetId), card: card(loc, cap.params.rank) });
    case 'scene.baron.vs': {
      const { actorId, rankA, targetId, rankB } = cap.params;
      const params = { cardA: card(loc, rankA), target: name(loc, targetId), cardB: card(loc, rankB) };
      return isSelf(loc, actorId)
        ? loc.t('scene.baron.vs.self', params)
        : loc.t(cap.key, { actor: name(loc, actorId), ...params });
    }
    case 'scene.baron.backfire': {
      const { actorId, rank } = cap.params;
      const params = { card: card(loc, rank) };
      return isSelf(loc, actorId)
        ? loc.t('scene.baron.backfire.self', params)
        : loc.t(cap.key, { actor: name(loc, actorId), ...params });
    }
    case 'scene.baron.tie': {
      const { actorId, targetId, rank } = cap.params;
      const params = { card: card(loc, rank), target: name(loc, targetId) };
      return isSelf(loc, actorId)
        ? loc.t('scene.baron.tie.self', params)
        : loc.t(cap.key, { actor: name(loc, actorId), ...params });
    }
    case 'scene.king.swapped':
      return loc.t(cap.key);
    case 'scene.peek.self':
      return loc.t(cap.key, { target: name(loc, cap.params.targetId), card: card(loc, cap.params.rank) });
    case 'scene.peek.other':
      return loc.t(cap.key, { actor: name(loc, cap.params.actorId), target: name(loc, cap.params.targetId) });
    case 'scene.handmaid': {
      const { actorId } = cap.params;
      return isSelf(loc, actorId) ? loc.t('scene.handmaid.self') : loc.t(cap.key, { actor: name(loc, actorId) });
    }
    case 'scene.prince': {
      const { targetId, rank } = cap.params;
      const params = { card: card(loc, rank) };
      return isSelf(loc, targetId)
        ? loc.t('scene.prince.self', params)
        : loc.t(cap.key, { target: name(loc, targetId), ...params });
    }
    case 'scene.countess':
    case 'scene.countess.forced':
      // "You discard the Countess" — the verb agrees with both forms.
      return loc.t(cap.key, { actor: name(loc, cap.params.actorId), card: card(loc, cap.params.rank) });
    case 'scene.princess': {
      const { actorId } = cap.params;
      return isSelf(loc, actorId) ? loc.t('scene.princess.self') : loc.t(cap.key, { actor: name(loc, actorId) });
    }
    case 'scene.fizzle': {
      const { actorId, rank } = cap.params;
      const params = { card: card(loc, rank) };
      return isSelf(loc, actorId)
        ? loc.t('scene.fizzle.self', params)
        : loc.t(cap.key, { actor: name(loc, actorId), ...params });
    }
  }
}

/**
 * Decompose one scene into its three-step stages for the renderer. The
 * played card always ends visibly in the actor's discard pile; targeting
 * cards sweep toward the target (a `via` waypoint) before settling. The
 * effect beat carries the verdict caption (~1.5s hold). The King plays to
 * the pile first, then the two (private) hand cards cross as backs.
 *
 * Every scene carries its verdict now (ticket 26) — the old split (a sweep
 * scene without a verdict, a separate verdict beat) is gone; each scene is
 * the full three-step story.
 */
export function sceneStages(scene: Scene, loc: SceneLoc): Stage[] {
  const { playedRank, actorId } = scene;
  const targetId = scene.targetId;
  const verdict = scene.verdict !== undefined ? captionText(loc, scene.verdict) : undefined;
  const caption = (): Stage => ({ els: [{ kind: 'caption', text: verdict ?? '' }], ms: STAGE_MS.caption });
  /** The sweep: from the actor, toward the target, settling into the pile. */
  const sweep = (rank: Rank): StageEl[] =>
    targetId !== undefined
      ? [{ kind: 'fly', rank, from: actorId, via: targetId, to: actorId, toPile: true }]
      : [{ kind: 'fly', rank, from: actorId, to: actorId, toPile: true }];

  switch (scene.kind) {
    case 'guard':
      // Sweep with the accusation tag, then the outcome: a hit flashes the
      // real card at the target; a miss reveals nothing.
      return [
        {
          els: [
            ...sweep(playedRank),
            ...(targetId !== undefined && scene.tag !== undefined ? [{ kind: 'tag' as const, text: captionText(loc, scene.tag), at: targetId }] : []),
          ],
          ms: STAGE_MS.fly,
        },
        ...(scene.revealedRank !== undefined && scene.revealedAt !== undefined
          ? [{ els: [{ kind: 'flash' as const, rank: scene.revealedRank, at: scene.revealedAt }], ms: STAGE_MS.flash }]
          : []),
        caption(),
      ];

    case 'baron':
      // The loser's card flashes; both public cards flash side by side
      // when the target lost (the Baron backfiring shows the actor's own
      // hand; a tie reveals nothing).
      return [
        { els: sweep(playedRank), ms: STAGE_MS.fly },
        ...(scene.revealedRank !== undefined && scene.revealedAt !== undefined
          ? scene.revealedAt === actorId
            ? [{ els: [{ kind: 'flash' as const, rank: scene.revealedRank, at: actorId }], ms: STAGE_MS.flash }]
            : targetId !== undefined
              ? [{ els: [{ kind: 'pair' as const, rankA: playedRank, atA: actorId, rankB: scene.revealedRank, atB: scene.revealedAt }], ms: STAGE_MS.pair }]
              : []
          : []),
        caption(),
      ];

    case 'king':
      // The King plays to the pile first; the private hands cross as backs.
      return [
        { els: [{ kind: 'fly', rank: playedRank, from: actorId, to: actorId, toPile: true }], ms: STAGE_MS.flyDirect },
        ...(targetId !== undefined
          ? [{ els: [{ kind: 'backFly' as const, from: actorId, to: targetId }, { kind: 'backFly' as const, from: targetId, to: actorId }], ms: STAGE_MS.backFly }]
          : []),
        caption(),
      ];

    case 'peek':
      return [
        { els: sweep(playedRank), ms: STAGE_MS.fly },
        // Only the peeker's own stream carries the card — others see the
        // peek happen with no card.
        ...(scene.peekRank !== undefined && targetId !== undefined
          ? [{ els: [{ kind: 'flash' as const, rank: scene.peekRank, at: targetId }], ms: STAGE_MS.flash }]
          : []),
        caption(),
      ];

    case 'prince':
      // The sweep, then the target's forced discard flying to their pile,
      // then the verdict.
      return [
        { els: sweep(playedRank), ms: STAGE_MS.fly },
        ...(scene.discardRank !== undefined && targetId !== undefined
          ? [{ els: [{ kind: 'fly' as const, rank: scene.discardRank, from: targetId, to: targetId, toPile: true }], ms: STAGE_MS.flyDirect }]
          : []),
        caption(),
      ];

    case 'simple':
      // Handmaid / Countess / Princess / fizzle — a straight flight to the
      // actor's pile, then the outcome beat (the Princess's own hand flash).
      return [
        { els: [{ kind: 'fly', rank: playedRank, from: actorId, to: actorId, toPile: true }], ms: STAGE_MS.flyDirect },
        ...(scene.revealedRank !== undefined && scene.revealedAt !== undefined
          ? [{ els: [{ kind: 'flash' as const, rank: scene.revealedRank, at: scene.revealedAt }], ms: STAGE_MS.flash }]
          : []),
        caption(),
      ];

    case 'reveal':
      // A fold or leave reveals the player's hand — a single flash, no caption.
      return [{ els: [{ kind: 'flash', rank: playedRank, at: actorId }], ms: STAGE_MS.flash }];
  }
}
