/**
 * Scene derivation (ticket 23) — the pure seam under the play animations.
 * Replaces the ticket-22 per-entry mini-beats: instead of mapping each fresh
 * log entry to one fly/flash/banner, the entries are correlated into one
 * **scene per play** that ends with the outcome. Every scene follows the same
 * three-step template — Use (the card lifts from the actor's hand) → Travel
 * & archive (targeting cards sweep toward the target, then settle into the
 * actor's discard pile; non-targeting cards fly straight to the pile) →
 * Effect (the outcome beat with a short verdict caption). The renderer
 * (`PlayScenes`) turns each scene into concrete beats via `sceneStages`.
 *
 * The log stays exactly as it is — grouping is pure client presentation
 * (ADR-0003 untouched). Three states bridge the batches: a targeting play
 * opens a **pending** scene on its `play` entry; its resolution marker
 * (`guard`/`baron`/`prince`/`king`/`peek`) converts it into a **resolving**
 * scene for the verdict-carrying kinds (guard/baron/prince). Those scenes
 * are **split in two**: the *sweep* (the played card lifting and traveling,
 * with the Guard's accusation) is emitted at the marker so the animation
 * starts immediately, and the *verdict beat* (the outcome flash/pair plus
 * the caption) is emitted only when the reveal/discard that decides it
 * arrives — or a trigger (the next play, a round boundary) closes it — so a
 * split between the marker and its consequences can never finalize a wrong
 * verdict, and a missed Guard still animates on time. `king`/`peek` know
 * their outcome at the marker and play at once. Consequences in the same
 * batch absorb into the open scene; a fizzle is its own mini-scene;
 * non-targeting plays (handmaid/countess/princess) are single-card scenes;
 * round/match wins become a banner moment that always follows the final
 * scene.
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
  /** Guard: the guessed rank (the accuses tag + hit/miss comparison). */
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
  /** The verdict caption for the effect beat; finalized when the reveal or
   *  discard that decides it arrives (guard hit/miss, baron outcome, the
   *  Prince's discard). */
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
  /** A targeting play whose resolution marker hasn't arrived yet. */
  pending: PendingScene | null;
  /** A guard/baron/prince scene awaiting the reveal/discard that decides its
   *  verdict — emitted only when that arrives or a trigger closes it. */
  resolving: Scene | null;
}

/** A targeting play awaiting its resolution entry (the next batch). */
interface PendingScene {
  /** The resolution marker kind that will complete it (priest → peek). */
  kind: 'guard' | 'peek' | 'baron' | 'prince' | 'king';
  actorId: string;
  playedRank: Rank;
}

export const initialSceneState = (): SceneState => ({ seq: 0, lastPlayed: {}, pending: null, resolving: null });

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

/**
 * Map a batch of fresh log entries to scenes (zero or more) and the next
 * state. `fmt` localizes banner text (round/match lines); it is only called
 * for banner entries. A targeting play opens a pending scene (no scene yet);
 * its resolution completes it — the two can arrive in different batches.
 */
export function scenesFor(fresh: LogEntry[], state: SceneState, fmt: (entry: LogEntry) => string): {
  state: SceneState;
  scenes: SceneOrBanner[];
} {
  let seq = state.seq;
  let lastPlayed = { ...state.lastPlayed };
  let pending = state.pending;
  let resolving = state.resolving;
  const scenes: SceneOrBanner[] = [];
  /** The emitted scene absorbing consequences — within this batch only. */
  let open: Scene | null = null;

  const nextKey = () => `s${++seq}`;

  /**
   * Emit the verdict beat of a resolving (split) guard/baron/prince scene.
   * The sweep scene was already emitted at the marker; this clones it with
   * its finalized verdict as a second scene that plays the outcome.
   */
  const emitVerdict = () => {
    if (resolving === null) return;
    // Clone first — the sweep scene keeps no verdict (it renders only the
    // travel steps); the verdict beat is a separate scene with the outcome.
    const verdictScene = { ...resolving, key: nextKey() };
    finalizeScene(verdictScene);
    scenes.push(verdictScene);
    open = verdictScene; // same-batch consequences (a second Prince discard) still absorb
    resolving = null;
  };

  /** Close the open scene; emit any pending verdict first. */
  const closeOpen = () => {
    emitVerdict();
    open = null;
  };

  for (let i = 0; i < fresh.length; i++) {
    const entry = fresh[i]!;
    const { params } = entry;
    const playerId = params.playerId as string | undefined;
    const targetId = params.targetId as string | undefined;
    const entryRank = params.rank as Rank | undefined;
    const key = nextKey();
    const remaining = fresh.slice(i + 1);

    switch (entry.kind) {
      case 'play': {
        // Any pending/resolving scene was never resolved (defensive — a play
        // always follows the previous resolution) — close it silently.
        pending = null;
        closeOpen();
        if (playerId !== undefined && entryRank !== undefined) {
          lastPlayed = { ...lastPlayed, [playerId]: entryRank };
          if (isTargeting(entryRank)) {
            pending = { kind: TARGETING[entryRank], actorId: playerId, playedRank: entryRank };
          } else {
            const scene: Scene = {
              key,
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
            key,
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
            key,
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
      case 'prince':
      case 'king':
      case 'peek': {
        // A second peek entry for the same hand (a 2-card target) folds into
        // the open peek scene instead of starting a new one.
        if (
          entry.kind === 'peek'
          && open !== null && open.kind === 'peek'
          && open.actorId === playerId && open.targetId === targetId
        ) {
          if (entryRank !== undefined) open.peekRank = entryRank;
          break;
        }
        closeOpen();
        if (playerId === undefined || targetId === undefined) break;
        const played = pending !== null && pending.kind === entry.kind ? pending.playedRank : lastPlayed[playerId];
        if (played === undefined) break; // no art — nothing to show (defensive)
        pending = null;
        const scene: Scene = { key, kind: entry.kind, actorId: playerId, targetId, playedRank: played };
        if (entry.kind === 'guard') {
          if (entryRank !== undefined) scene.guessRank = entryRank;
          scene.tag = { key: 'scene.guard.accuses', params: { actorId: playerId, targetId, rank: entryRank ?? played } };
          // Split: the sweep plays now (the card lifts and sweeps with the
          // accusation); the hit/miss verdict needs the target's reveal.
          scenes.push(scene);
          open = scene;
          resolving = scene;
        } else if (entry.kind === 'baron' || entry.kind === 'prince') {
          // Split: the sweep plays now; the outcome needs the loser's reveal
          // (baron) or the target's discard (prince).
          scenes.push(scene);
          open = scene;
          resolving = scene;
        } else if (entry.kind === 'king') {
          scene.verdict = { key: 'scene.king.swapped' };
          scenes.push(scene);
          open = scene;
        } else {
          // Peek: the peeker's own stream carries the card — the self verdict;
          // a viewer without it sees the peek happen with no card.
          scene.verdict =
            entryRank !== undefined
              ? { key: 'scene.peek.self', params: { targetId, rank: entryRank } }
              : { key: 'scene.peek.other', params: { actorId: playerId, targetId } };
          if (entryRank !== undefined) scene.peekRank = entryRank;
          scenes.push(scene);
          open = scene;
        }
        break;
      }

      case 'reveal': {
        // A reveal with a resolving scene is that scene's consequence (guard
        // hit, baron loser) unless it is the deck-empty round end — the
        // resolution's reveal is always followed by its eliminate, the round
        // end is followed by `round`/`match` in the same batch.
        const hasEliminate = remaining.some((e) => e.kind === 'eliminate');
        const endsRound = remaining.some((e) => e.kind === 'round' || e.kind === 'match');
        if (resolving !== null && playerId !== undefined && entryRank !== undefined) {
          if (!hasEliminate && endsRound) {
            // Deck-empty round end with no resolution reveal (a missed Guard
            // or a Baron tie) — emit the verdict as-is; the reveal belongs
            // to the round and animates nothing (the banner is the beat).
            emitVerdict();
            break;
          }
          // The reveal decides the outcome — even if its eliminate was split
          // to another batch, the reveal alone tells hit vs miss / win vs lose.
          resolving.revealedRank = entryRank;
          resolving.revealedAt = playerId;
          emitVerdict();
          break;
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
          const scene: Scene = { key, kind: 'reveal', actorId: playerId, playedRank: entryRank };
          scenes.push(scene);
          open = scene;
        }
        break;
      }

      case 'eliminate':
        // The outcome — the view dims the seat through the out-state
        // transition; the open scene already carries the reveal it pairs with.
        break;

      case 'discard': {
        const reason = params.reason as string | undefined;
        if (reason === 'prince') {
          if (resolving !== null && resolving.kind === 'prince') {
            // The Prince's target discards — this decides the prince verdict.
            if (resolving.discardRank === undefined && entryRank !== undefined) resolving.discardRank = entryRank;
            emitVerdict();
            break;
          }
          if (open !== null && open.kind === 'prince') break; // a second card of the same forced discard
        }
        closeOpen();
        if (playerId !== undefined && entryRank !== undefined) {
          // The forced Countess (after a draw or a King trade) is its own
          // mini-scene; any stray discard (defensive) flies the same way.
          const scene: Scene = {
            key,
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
        scenes.push({ key, kind: 'banner', text: fmt(entry) });
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

  // An emitted scene's same-batch absorption window ends with the batch. A
  // resolving scene deliberately survives it — its verdict may arrive next
  // batch (or a trigger closes it), so it is never finalized at batch end.

  return { state: { seq, lastPlayed, pending, resolving }, scenes };
}

/**
 * Finalize a pending resolution whose reveal/discard never arrived (a missed
 * Guard, a Baron tie) — the renderer calls this when a split sweep finishes
 * playing with no verdict scene behind it, so the caption is not delayed
 * until the next play. Only verdicts determinable without more data are
 * emitted: a missed Guard (no reveal) and a Baron tie. A Prince needs its
 * discard entry and stays pending until it arrives. Idempotent.
 */
export function forceVerdict(state: SceneState): { state: SceneState; scenes: SceneOrBanner[] } {
  const pending = state.resolving;
  if (pending === null || pending.kind === 'prince') return { state, scenes: [] };
  const verdictScene = { ...pending, key: `s${state.seq + 1}` };
  finalizeScene(verdictScene);
  return {
    state: { ...state, seq: state.seq + 1, resolving: null },
    scenes: [verdictScene],
  };
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

/** Fill the verdicts that depend on the reveal/discard following the marker. */
function finalizeScene(scene: Scene): void {
  if (scene.verdict !== undefined) return;
  switch (scene.kind) {
    case 'guard': {
      const target = scene.targetId ?? scene.actorId;
      scene.verdict =
        scene.revealedRank !== undefined && scene.revealedAt === scene.targetId
          ? { key: 'scene.guard.hit', params: { targetId: target, rank: scene.revealedRank } }
          : { key: 'scene.guard.miss', params: { targetId: target, rank: scene.guessRank ?? scene.playedRank } };
      break;
    }
    case 'baron': {
      const target = scene.targetId ?? scene.actorId;
      scene.verdict =
        scene.revealedRank === undefined
          ? { key: 'scene.baron.tie', params: { actorId: scene.actorId, targetId: target, rank: scene.playedRank } }
          : scene.revealedAt === scene.actorId
            ? { key: 'scene.baron.backfire', params: { actorId: scene.actorId, rank: scene.revealedRank } }
            : { key: 'scene.baron.vs', params: { actorId: scene.actorId, rankA: scene.playedRank, targetId: target, rankB: scene.revealedRank } };
      break;
    }
    case 'prince':
      if (scene.discardRank !== undefined) {
        scene.verdict = { key: 'scene.prince', params: { targetId: scene.targetId ?? scene.actorId, rank: scene.discardRank } };
      }
      break;
    default:
      break;
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
 * Guard/baron/prince scenes are split: without a verdict they render only
 * the sweep (the card lifting and traveling), with a verdict they render
 * the outcome beat (the flash/pair plus the caption).
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
      if (scene.verdict === undefined) {
        // Sweep: the card lifts and sweeps toward the target, accused.
        const tag = scene.tag !== undefined ? captionText(loc, scene.tag) : undefined;
        return [
          {
            els: [
              ...sweep(playedRank),
              ...(targetId !== undefined && tag !== undefined ? [{ kind: 'tag' as const, text: tag, at: targetId }] : []),
            ],
            ms: STAGE_MS.fly,
          },
        ];
      }
      // Verdict: hit flashes the real card at the target; miss shows nothing.
      return [
        ...(scene.revealedRank !== undefined && scene.revealedAt !== undefined
          ? [{ els: [{ kind: 'flash' as const, rank: scene.revealedRank, at: scene.revealedAt }], ms: STAGE_MS.flash }]
          : []),
        caption(),
      ];

    case 'baron':
      if (scene.verdict === undefined) {
        return [{ els: sweep(playedRank), ms: STAGE_MS.fly }];
      }
      {
        const revealed = scene.revealedRank !== undefined && scene.revealedAt !== undefined;
        return [
          // The loser's card flashes; both public cards flash side by side
          // when the target lost (the Baron backfiring shows the actor's own
          // hand; a tie reveals nothing).
          ...(revealed && scene.revealedAt === actorId
            ? [{ els: [{ kind: 'flash' as const, rank: scene.revealedRank!, at: actorId }], ms: STAGE_MS.flash }]
            : revealed && targetId !== undefined
              ? [{ els: [{ kind: 'pair' as const, rankA: playedRank, atA: actorId, rankB: scene.revealedRank!, atB: scene.revealedAt! }], ms: STAGE_MS.pair }]
              : []),
          caption(),
        ];
      }

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
      if (scene.verdict === undefined) {
        return [{ els: sweep(playedRank), ms: STAGE_MS.fly }];
      }
      return [
        // The target's forced discard flies to their pile.
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
