/**
 * The story seam (ticket 38) — the single presentation seam under the play
 * animations. One input (fresh log entries), three outputs: the scenes the
 * story narrates, the draws it is **holding** (their log id is beyond the
 * story position — the drawer's own card, the deck count, and the seat hand
 * counts keep their pre-draw values), and the draws it has **released**
 * (the story passed them — the display applies them). The hook (`useStory`,
 * PlayScenes.tsx) owns the queue and the release moment; everything here is
 * pure so the whole seam is unit-testable without a browser (story.test.ts).
 *
 * Draws enter the log (`view.ts`'s `cardDrawn` logs `draw` — ticket 38 D),
 * so the seam derives everything from the log: `storyFor` runs the scene
 * builder over the fresh entries and folds a draw ledger alongside it. The
 * ledger is the memory of every draw the story has seen, so a draw that
 * folds while the queue is busy can be withheld now and applied when the
 * story reaches it.
 *
 * Two edge cases shape the ledger:
 *
 * ① **Forced-Countess collision.** A draw of the Countess is followed, in
 *    the same apply burst, by her forced discard (the engine checks
 *    immediately after a draw). The view folds both — net hand-count change
 *    zero — so withholding the draw would underflow the displayed count. A
 *    `discard` (countess) for a player with a held draw cancels it. The
 *    drawer's own stream knows the drawn card and matches by identity; every
 *    other stream sees no name and cancels the player's most recent held
 *    draw — the hand count is public, so it must not underflow there either.
 * ② **Burned-card draw.** A draw on an empty deck takes the single face-down
 *    burned card (ruling 4) — the deck count does not shrink, so the draw's
 *    `shrunk` flag is false and the lagged deck is never inflated.
 */

import type { CardName, LogEntry, Rank, ViewState } from '@love-letter/core';
import { CARD_INFO } from '@love-letter/core';
import {
  initialSceneState,
  scenesFor,
  type SceneOrBanner,
  type SceneState,
  type SceneViewer,
} from './scenes';

/** A draw the story is telling (or has told). */
export interface DrawRecord {
  /** The draw's log entry id — the story position is measured against it. */
  entryId: number;
  playerId: string;
  /** Whether this draw shrank the deck — false for the burned-card draw
   *  (ruling 4: the deck count does not shrink), so the lagged deck is not
   *  inflated (edge ②). */
  shrunk: boolean;
  /** The drawn card's identity — only on the drawer's own stream (privacy,
   *  same as peek); the countess cancellation (edge ①) matches on it. */
  name?: CardName;
  /** Cancelled by a same-burst discard (edge ①) — the drawn card was
   *  discarded in the same burst; releasing it would show a card that is
   *  gone and underflow the hand count. Cancelled draws never release. */
  cancelled: boolean;
}

/** The scene builder's state plus the draw ledger. */
export interface StoryState extends SceneState {
  /** Every draw seen so far, in log order — retained until released or cancelled. */
  draws: DrawRecord[];
}

export const initialStoryState = (): StoryState => ({ ...initialSceneState(), draws: [] });

/** The newest log entry id (0 when the log is empty). */
export function maxLogId(log: LogEntry[]): number {
  return log.reduce((m, e) => Math.max(m, e.id), 0);
}

/**
 * The story position: the head beat's entry id while the queue plays (the
 * story tells up to it), or the newest log id when idle (a drain releases
 * everything up to the newest entry). Undefined only while the log is empty.
 * Reduced motion enqueues nothing, so the position is always the newest id —
 * draws release instantly (edge ④); the mount baseline skips history, so a
 * reconnecting client's ledger starts empty — nothing is ever held (edge ④).
 */
export function storyPosition(log: LogEntry[], head: SceneOrBanner | undefined): number | undefined {
  if (head !== undefined && head.entryId !== undefined) return head.entryId;
  const newest = maxLogId(log);
  return newest === 0 ? undefined : newest;
}

/** Classify the draw ledger against the story position: held = beyond the
 *  position (withheld from the lagged view), released = passed (applied).
 *  Cancelled draws never release. */
export function heldAndReleased(
  draws: DrawRecord[],
  position: number | undefined,
): { held: DrawRecord[]; released: DrawRecord[] } {
  const active = draws.filter((d) => !d.cancelled);
  if (position === undefined) return { held: [], released: [] };
  return {
    held: active.filter((d) => d.entryId > position),
    released: active.filter((d) => d.entryId <= position),
  };
}

/**
 * Edge ① — a forced Countess discard collides with a held draw: the drawn
 * card was discarded in the same burst. Releasing it would show a card that
 * is gone and underflow the hand count, so the held draw is cancelled. The
 * drawer's own stream knows the drawn card and matches by identity; every
 * other stream sees no name and cancels the player's most recent held draw —
 * the count is the public signal there, and the identity of the cancelled
 * draw does not change the count.
 *
 * The name match is the precise rule, but a related corner needs the same
 * fix: when the drawer *already* holds the Countess and the forced discard
 * removes her (drawing a King/Prince instead), the drawn card does not match
 * the discarded card — yet the player's hand-count change across the burst
 * is still net zero, so withholding the draw would underflow the count and
 * show the drawer an empty hand. The fallback (the player's most recent held
 * draw) keeps the count right there too; the drawn card may appear a beat
 * early in that corner, which the count-mismatch alternative makes worse.
 */
function cancelForDiscard(draws: DrawRecord[], entry: LogEntry, position: number | undefined): DrawRecord[] {
  if (entry.params.reason !== 'countess') return draws;
  const playerId = entry.params.playerId;
  const rank = entry.params.rank;
  if (typeof playerId !== 'string') return draws;
  // Only draws the story has not yet told can collide — a released draw was
  // already applied; cancelling it would drop it from the display retroactively.
  const heldByPlayer = draws.filter(
    (d) => !d.cancelled && d.playerId === playerId && (position === undefined || d.entryId > position),
  );
  if (heldByPlayer.length === 0) return draws;
  const discardedName = typeof rank === 'number' && rank >= 1 && rank <= 8 ? CARD_INFO[rank as Rank].name : undefined;
  const hit =
    heldByPlayer.find((d) => d.name !== undefined && d.name === discardedName)
    ?? heldByPlayer.reduce((a, b) => (b.entryId > a.entryId ? b : a));
  return draws.map((d) => (d === hit ? { ...d, cancelled: true } : d));
}

/** What one fresh batch contributes to the story: new scenes, ledger updates,
 *  and the held/released split against the story position at fold time. */
export interface StoryForResult {
  state: StoryState;
  scenes: SceneOrBanner[];
  /** Draws beyond the story position — the display withholds them. */
  held: DrawRecord[];
  /** Draws the story has passed — the display applies them. */
  released: DrawRecord[];
}

/**
 * Map a batch of fresh log entries to scenes and draw-ledger updates — the
 * scene builder plus the draw ledger (ticket 38). `position` is the story
 * position at fold time (the head beat's entry id, or the newest log id when
 * idle): new draws classify against it, and the countess cancellation (edge
 * ①) needs it to know which draws are still held. The hook re-classifies on
 * every render as the queue drains, so the fold-time split is only the
 * cancellation's reference — the display always derives from the current
 * position.
 */
export function storyFor(
  fresh: LogEntry[],
  state: StoryState,
  fmt: (entry: LogEntry) => string,
  viewer?: SceneViewer,
  position?: number,
): StoryForResult {
  const scenes = scenesFor(fresh, state, fmt, viewer);
  let draws = [...state.draws];
  for (const entry of fresh) {
    if (entry.kind === 'draw') {
      const name = typeof entry.params.name === 'string' ? (entry.params.name as CardName) : undefined;
      draws.push({
        entryId: entry.id,
        playerId: entry.params.playerId as string,
        shrunk: entry.params.shrunk === true,
        ...(name !== undefined ? { name } : {}),
        cancelled: false,
      });
    } else if (entry.kind === 'discard') {
      draws = cancelForDiscard(draws, entry, position);
    }
  }
  const { held, released } = heldAndReleased(draws, position);
  return { state: { ...scenes.state, draws }, scenes: scenes.scenes, held, released };
}

/**
 * The lagged display view (ticket 38): the true view with not-yet-told draws
 * withheld — the drawer's own card, the deck count, and the seat hand counts
 * keep their pre-draw values until the story releases the draw. Held self
 * cards come out of the hand by identity (a duplicate keeps its own slot);
 * the deck count is inflated by the held draws that shrank it (a burned-card
 * draw never shrank it — edge ②); per-player hand counts lose their held
 * draws. Everything else (tokens, discards, out/protected, turn, phase) is
 * identical to the true view.
 */
export function lagViewOf(view: ViewState, held: DrawRecord[]): ViewState {
  if (held.length === 0) return view;
  const next = structuredClone(view);
  for (const d of held) {
    const player = next.players.find((p) => p.id === d.playerId);
    if (player) player.handCount = Math.max(0, player.handCount - 1);
    if (d.shrunk) next.deckCount += 1;
    // Only the drawer's own stream carries the drawn card's name — remove it
    // from the displayed hand by identity, so a duplicate of the same card
    // keeps its own slot.
    if (d.name !== undefined) {
      const index = next.hand.findIndex((c) => c.name === d.name);
      if (index !== -1) next.hand.splice(index, 1);
    }
  }
  return next;
}
