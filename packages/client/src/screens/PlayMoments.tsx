/**
 * Card-moment animations (ticket 22): a transient, non-interactive layer
 * over the table that plays one beat at a time as log entries arrive live.
 * Only cards move — a played/resolved card flies from one seat to another
 * (or to its owner's pile), a revealed card flashes at its seat, and
 * round/match wins get a short fading banner. Seats never fly; elimination
 * dims the seat through the existing out-state transition (CSS).
 *
 * Live-only: the mount baseline skips the replayed history, so a
 * reconnecting player never sees the past animate. prefers-reduced-motion
 * disables all motion — the top bar text carries the moment, as before.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { LogEntry } from '@love-letter/core';
import { useLocale } from '../i18n';
import { formatLogEntry, type LogContext } from '../i18n/logFormat';
import { initialMomentState, momentsFor, type Moment, type MomentState } from '../moments';

const CARD_W = 3.2; // rem, matches .moment-fly width
const CARD_H = CARD_W * 1.5;

function seatEl(id: string): HTMLElement | null {
  return document.querySelector(`.scoreboard .seat[data-player-id="${CSS.escape(id)}"]`);
}

/** Layer-relative rect of an element — the .moments overlay is the origin. */
function layerRect(el: Element): DOMRect {
  const r = el.getBoundingClientRect();
  const layer = document.querySelector('.moments');
  const lr = layer !== null ? layer.getBoundingClientRect() : r;
  return new DOMRect(r.left - lr.left, r.top - lr.top, r.width, r.height);
}

/** The destination rect for a fly: the target's seat, or its discard pile. */
function destRect(id: string, pile: boolean): { cx: number; cy: number } | null {
  const el = pile ? document.querySelector(`.scoreboard .seat[data-player-id="${CSS.escape(id)}"] .pile img`) ?? seatEl(id) : seatEl(id);
  if (el === null) return null;
  const r = layerRect(el);
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/** Layer-relative center of a seat (for the flash position). */
function seatCenter(id: string): { x: number; y: number } | null {
  const el = seatEl(id);
  if (el === null) return null;
  const r = layerRect(el);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/**
 * Backstop for a beat: advance the queue if the animation never ends on its
 * own (animationend normally fires first; the timer covers a cancelled or
 * stalled animation, e.g. a mid-flight prefers-reduced-motion toggle).
 * Idempotent with the queue's filter-by-key advance.
 */
function useBeatTimer(durationMs: number, onDone: () => void): void {
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => doneRef.current(), durationMs + 400);
    return () => clearTimeout(t);
  }, [durationMs]);
}

function FlyView({ moment, onDone }: { moment: Extract<Moment, { kind: 'fly' }>; onDone: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useBeatTimer(1100, onDone);

  useEffect(() => {
    const from = seatCenter(moment.from);
    const to = destRect(moment.to, moment.toPile);
    if (from === null || to === null) {
      doneRef.current();
      return;
    }
    setPos({
      x: from.x - (CARD_W / 2) * 16, // rem → px at 16px root
      y: from.y - (CARD_H / 2) * 16,
      dx: to.cx - from.x,
      dy: to.cy - from.y,
    });
  }, [moment]);

  if (pos === null) return null;
  return (
    <img
      className="moment moment-fly"
      src={`/cards/${moment.rank}.png`}
      alt=""
      draggable={false}
      style={{ left: pos.x, top: pos.y, '--dx': `${pos.dx}px`, '--dy': `${pos.dy}px` } as CSSProperties}
      onAnimationEnd={onDone}
    />
  );
}

function FlashView({ moment, onDone }: { moment: Extract<Moment, { kind: 'flash' }>; onDone: () => void }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useBeatTimer(1200, onDone);

  useEffect(() => {
    const c = seatCenter(moment.at);
    if (c === null) {
      doneRef.current();
      return;
    }
    setPos({ x: c.x - 2 * 16, y: c.y - 3 * 16 }); // 4rem × 6rem flash, centered
  }, [moment]);

  if (pos === null) return null;
  return (
    <img
      className="moment moment-flash"
      src={`/cards/${moment.rank}.png`}
      alt=""
      draggable={false}
      style={{ left: pos.x, top: pos.y }}
      onAnimationEnd={onDone}
    />
  );
}

function BannerView({ moment, onDone }: { moment: Extract<Moment, { kind: 'banner' }>; onDone: () => void }) {
  useBeatTimer(2200, onDone);
  return (
    <div className="moment moment-banner" onAnimationEnd={onDone}>
      {moment.text}
    </div>
  );
}

export function PlayMoments({ log, selfId, roster }: { log: LogEntry[]; selfId: string; roster: Record<string, string> }) {
  const { t, cardName } = useLocale();
  const [queue, setQueue] = useState<Moment[]>([]);
  const stateRef = useRef<MomentState>(initialMomentState());
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
    let next = stateRef.current;
    const added: Moment[] = [];
    for (const e of fresh) {
      const r = momentsFor(e, next, (entry) => formatLogEntry(entry, ctx));
      next = r.state;
      added.push(...r.moments);
    }
    stateRef.current = next;
    if (added.length > 0) setQueue((q) => [...q, ...added]);
  }, [log]);

  // Only the head plays at a time; filter-by-key is idempotent, so a late
  // animationend can never skip the next moment.
  const advance = (key: string) => setQueue((q) => q.filter((m) => m.key !== key));
  const head = queue[0] ?? null;

  return (
    <div className="moments" aria-hidden="true">
      {head !== null && head.kind === 'fly' && <FlyView key={head.key} moment={head} onDone={() => advance(head.key)} />}
      {head !== null && head.kind === 'flash' && <FlashView key={head.key} moment={head} onDone={() => advance(head.key)} />}
      {head !== null && head.kind === 'banner' && <BannerView key={head.key} moment={head} onDone={() => advance(head.key)} />}
    </div>
  );
}
