/**
 * Scene animations (ticket 23): a transient, non-interactive layer over the
 * table that plays one **scene** at a time as log entries arrive live —
 * each play becomes one coherent moment that ends with the outcome. Every
 * scene follows the three-step template (Use → Travel & archive → Effect):
 * the played card lifts from the actor's seat, targeting cards sweep toward
 * the target before settling into the actor's discard pile, and the outcome
 * beat ends with a short verdict caption (~1.5s hold). The King plays to the
 * pile first, then the two (private) hand cards cross as backs; a Guard hit
 * flashes the real card and the seat dims; the peeked card appears face-up
 * at the target only on the Priest's chooser's own screen.
 *
 * The grouping lives in the pure seam (`scenes.ts`); this component is the
 * stage sequencer: one scene at a time, one stage at a time, each stage's
 * elements animating concurrently. Round/match wins are a banner moment that
 * always follows the final scene — it never interrupts the story.
 *
 * Live-only: the mount baseline skips the replayed history, so a
 * reconnecting player never sees the past animate. prefers-reduced-motion
 * disables all scenes — the top bar text carries the moment, as before.
 * Seats never fly — elimination dims the seat through the existing
 * out-state transition (CSS).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LogEntry, Rank } from '@love-letter/core';
import { useLocale } from '../i18n';
import { formatLogEntry, type LogContext } from '../i18n/logFormat';
import {
  initialSceneState,
  scenesFor,
  sceneStages,
  STAGE_MS,
  type Scene,
  type SceneOrBanner,
  type SceneState,
  type StageEl,
  type Banner,
} from '../scenes';

const CARD_W = 4; // rem — .scene-flash width
const CARD_H = CARD_W * 1.5;

function seatEl(id: string): HTMLElement | null {
  return document.querySelector(`.scoreboard .seat[data-player-id="${CSS.escape(id)}"]`);
}

/** Layer-relative rect of an element — the .scenes overlay is the origin. */
function layerRect(el: Element): DOMRect {
  const r = el.getBoundingClientRect();
  const layer = document.querySelector('.scenes');
  const lr = layer !== null ? layer.getBoundingClientRect() : r;
  return new DOMRect(r.left - lr.left, r.top - lr.top, r.width, r.height);
}

/** The destination rect for a fly: the target's seat, or its discard pile. */
function destRect(id: string, pile: boolean): { x: number; y: number } | null {
  const el = pile ? document.querySelector(`.scoreboard .seat[data-player-id="${CSS.escape(id)}"] .pile img`) ?? seatEl(id) : seatEl(id);
  if (el === null) return null;
  const r = layerRect(el);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Layer-relative center of a seat (for the fly start / flash position). */
function seatCenter(id: string): { x: number; y: number } | null {
  const el = seatEl(id);
  if (el === null) return null;
  const r = layerRect(el);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** The midpoint of two seats — where the Baron's cards flash side by side. */
function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Measure a beat element's screen position once on mount. A null measurement
 * (a missing seat or pile) means there is nothing to draw — the stage ends
 * immediately via onDone. Elements remount per stage (each stage renders a
 * different element type), so the effect runs exactly once per element.
 */
function useMeasure<T>(measure: () => T | null, onDone: (() => void) | undefined): T | null {
  const [value, setValue] = useState<T | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const next = measure();
    if (next === null) {
      doneRef.current?.();
      return;
    }
    setValue(next);
    // Measure once per mount — the element remounts for every stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return value;
}

/**
 * One card or back flying between seats. `via` is the seat the card sweeps
 * toward before settling (the targeting cards); the CSS falls back to a
 * straight line when it is absent (non-targeting plays fly to the pile).
 */
function FlyEl({ el, ms, onDone }: { el: Extract<StageEl, { kind: 'fly' | 'backFly' }>; ms: number; onDone?: (() => void) | undefined }) {
  const pos = useMeasure(() => {
    const from = seatCenter(el.from);
    const via = el.kind === 'fly' && el.via !== undefined ? seatCenter(el.via) : null;
    const to = el.kind === 'fly' ? destRect(el.to, el.toPile) : seatCenter(el.to);
    if (from === null || to === null) return null;
    const viaD = via !== null ? { x: via.x - from.x, y: via.y - from.y } : null;
    return {
      x: from.x - (CARD_W / 2) * 16,
      y: from.y - (CARD_H / 2) * 16,
      vx: viaD?.x ?? to.x - from.x,
      vy: viaD?.y ?? to.y - from.y,
      ex: to.x - from.x,
      ey: to.y - from.y,
    };
  }, onDone);

  if (pos === null) return null;
  return (
    <img
      className="scene scene-fly"
      src={el.kind === 'backFly' ? '/cards/back-light.png' : `/cards/${el.rank}.png`}
      alt=""
      draggable={false}
      style={
        {
          left: pos.x,
          top: pos.y,
          '--vx': `${pos.vx}px`,
          '--vy': `${pos.vy}px`,
          '--ex': `${pos.ex}px`,
          '--ey': `${pos.ey}px`,
          '--ms': `${ms}ms`,
        } as CSSProperties
      }
      onAnimationEnd={onDone}
    />
  );
}

/** A card flashing at a seat, or two cards flashing side by side (Baron). */
function FlashEl({ el, ms, onDone }: { el: Extract<StageEl, { kind: 'flash' | 'pair' }>; ms: number; onDone?: (() => void) | undefined }) {
  const cards = useMeasure(() => {
    if (el.kind === 'flash') {
      const at = seatCenter(el.at);
      if (at === null) return null;
      return [{ src: `/cards/${el.rank}.png`, x: at.x - (CARD_W / 2) * 16, y: at.y - (CARD_H / 2) * 16 }];
    }
    // pair — the midpoint between the two seats, each card offset to the side.
    const a = seatCenter(el.atA);
    const b = seatCenter(el.atB);
    if (a === null || b === null) return null;
    const mid = midpoint(a, b);
    const gap = 0.4 * 16; // 0.4rem between the two cards
    const w = CARD_W * 16;
    const h = CARD_H * 16;
    return [
      { src: `/cards/${el.rankA}.png`, x: mid.x - w - gap / 2, y: mid.y - h / 2 },
      { src: `/cards/${el.rankB}.png`, x: mid.x + gap / 2, y: mid.y - h / 2 },
    ];
  }, onDone);

  if (cards === null || cards.length === 0) return null;
  return (
    <>
      {cards.map((c, i) => (
        <img
          key={i}
          className="scene scene-flash"
          src={c.src}
          alt=""
          draggable={false}
          style={{ left: c.x, top: c.y, '--ms': `${ms}ms` } as CSSProperties}
          onAnimationEnd={i === cards.length - 1 ? onDone : undefined}
        />
      ))}
    </>
  );
}

/** A short tag at a seat — the Guard's accusation while the card sweeps. */
function TagEl({ el, ms, onDone }: { el: Extract<StageEl, { kind: 'tag' }>; ms: number; onDone?: (() => void) | undefined }) {
  const pos = useMeasure(() => {
    const at = seatCenter(el.at);
    if (at === null) return null;
    return { x: at.x, y: at.y - 2.5 * 16 }; // hover above the seat
  }, onDone);

  if (pos === null) return null;
  return (
    <div
      className="scene scene-tag"
      style={{ left: pos.x, top: pos.y, '--ms': `${ms}ms` } as CSSProperties}
      onAnimationEnd={onDone}
    >
      {el.text}
    </div>
  );
}

/** The verdict caption — centered over the table, held ~1.5s. */
function CaptionEl({ el, ms, onDone }: { el: Extract<StageEl, { kind: 'caption' }>; ms: number; onDone?: (() => void) | undefined }) {
  return (
    <div className="scene scene-caption" style={{ '--ms': `${ms}ms` } as CSSProperties} onAnimationEnd={onDone}>
      {el.text}
    </div>
  );
}

function StageElView({
  el,
  ms,
  onDone,
}: {
  el: StageEl;
  ms: number;
  onDone?: (() => void) | undefined;
}) {
  switch (el.kind) {
    case 'fly':
    case 'backFly':
      return <FlyEl el={el} ms={ms} onDone={onDone} />;
    case 'flash':
    case 'pair':
      return <FlashEl el={el} ms={ms} onDone={onDone} />;
    case 'tag':
      return <TagEl el={el} ms={ms} onDone={onDone} />;
    case 'caption':
      return <CaptionEl el={el} ms={ms} onDone={onDone} />;
  }
}

/**
 * One scene, played stage by stage: the elements of the current stage
 * animate concurrently for its duration, then the next stage starts. When
 * the last stage ends the scene drains (onDone). A backstop timer advances
 * a stage whose animation never ends (e.g. a cancelled animation), so the
 * queue can never stall.
 */
function SceneView({
  scene,
  selfId,
  roster,
  t,
  cardName,
  onDone,
}: {
  scene: Scene;
  selfId: string;
  roster: Record<string, string>;
  t: ReturnType<typeof useLocale>['t'];
  cardName: (rank: Rank) => string;
  onDone: () => void;
}) {
  const stages = useMemo(
    () => sceneStages(scene, { selfId, roster, t, cardName }),
    [scene, selfId, roster, t, cardName],
  );
  const [idx, setIdx] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const stage = stages[idx];

  // Backstop: advance if the stage's animation never ends on its own.
  useEffect(() => {
    if (stage === undefined) return;
    const timer = setTimeout(() => setIdx((i) => i + 1), stage.ms + 400);
    return () => clearTimeout(timer);
  }, [idx, stages]);

  // The last stage ended — the scene drains.
  useEffect(() => {
    if (stage === undefined) doneRef.current();
  }, [stage]);

  if (stage === undefined) return null;
  const last = stage.els.length - 1;
  const advance = () => setIdx((i) => i + 1);
  return (
    <>
      {stage.els.map((el, i) => (
        <StageElView key={i} el={el} ms={stage.ms} onDone={i === last ? advance : undefined} />
      ))}
    </>
  );
}

/** The round/match win banner — kept as a beat, always after the final scene. */
function BannerView({ banner, onDone }: { banner: Banner; onDone: () => void }) {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const timer = setTimeout(() => doneRef.current(), STAGE_MS.banner + 400);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      className="scene scene-banner"
      style={{ '--ms': `${STAGE_MS.banner}ms` } as CSSProperties}
      onAnimationEnd={onDone}
    >
      {banner.text}
    </div>
  );
}

export function PlayScenes({ log, selfId, roster }: { log: LogEntry[]; selfId: string; roster: Record<string, string> }) {
  const { t, cardName } = useLocale();
  const [queue, setQueue] = useState<SceneOrBanner[]>([]);
  const stateRef = useRef<SceneState>(initialSceneState());
  const seenIdRef = useRef<number | null>(null);

  useEffect(() => {
    const ctx: LogContext = { selfId, roster, t, cardName };
    const maxId = log.reduce((m, e) => Math.max(m, e.id), 0);
    if (seenIdRef.current === null) {
      seenIdRef.current = maxId; // mount baseline — the replayed history never animates
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      seenIdRef.current = maxId;
      return; // motion off — the top bar text carries the moment
    }
    const fresh = log.filter((e) => e.id > seenIdRef.current!);
    seenIdRef.current = maxId;
    const added = scenesFor(fresh, stateRef.current, (entry) => formatLogEntry(entry, ctx));
    stateRef.current = added.state;
    if (added.scenes.length > 0) setQueue((q) => [...q, ...added.scenes]);
  }, [log]);

  // Only the head plays at a time; filter-by-key is idempotent, so a late
  // scene drain can never skip the next one. Every resolution now completes
  // with an explicit event (ticket 26), so no sweep ever drains without a
  // verdict behind it — there is nothing to force.
  const advance = (key: string) => {
    setQueue((q) => q.filter((m) => m.key !== key));
  };
  const head = queue[0] ?? null;

  return (
    <div className="scenes" aria-hidden="true">
      {head !== null && head.kind === 'banner' && (
        <BannerView key={head.key} banner={head} onDone={() => advance(head.key)} />
      )}
      {head !== null && head.kind !== 'banner' && (
        <SceneView
          key={head.key} // a fresh mount per scene — the stage clock starts at zero
          scene={head}
          selfId={selfId}
          roster={roster}
          t={t}
          cardName={cardName}
          onDone={() => advance(head.key)}
        />
      )}
    </div>
  );
}
