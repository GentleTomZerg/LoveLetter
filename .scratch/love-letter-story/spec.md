# Love Letter — Story (the table narrates the game)

**Status:** active — 8/10 tickets resolved; 2 open (09 round-end-waits-for-story, 10 draw-appearance-sync)

**Type:** spec

**Effort:** love-letter-story

## Problem Statement

At a real table the outcome of a play is legible at a glance — the card lands
in the pile, the seat dims, the deck shrinks. On screen, state changes
silently. The client must **narrate** the game: the top of the screen tells
the story in lockstep with the cards, and the story never races the state —
the win banner follows the final scene, the round waits, and a draw appears
when the story reaches it, not when the event folds.

## Solution

A pure presentation layer over the event stream — the log stays one-event-
one-entry (ADR-0003); the animation groups events client-side.

- **The strip** (tickets 01, 02, 08) — the newest log entry renders in a
  fixed full-width top bar with a mini card thumbnail; the expanded history is
  a modal. The strip never races ahead: while a scene plays it shows the
  animating beat's entry, and the newest *arrived* line wins across log and
  room-activity sequences (a reconnect line never permanently owns the strip).
- **Card moments → scenes** (tickets 03, 04, 05) — every card follows the
  same three steps (use → travel & archive → effect verdict); the hand and
  choice buttons are disabled while the scene queue drains; a Guard miss and
  Baron tie arrive as data (`guardMissed` / `baronTied` from the engine
  feature) instead of being inferred; the Baron scene never implies the Baron
  itself was compared, and other viewers never see the actor's kept card.
- **The draw moment** (tickets 07, 10) — the drawer sees their new card pop
  and the deck count pulse; the open pair (ticket 10) makes the appearance
  *owned by the story*: draws are held while the queue is busy and released
  when the story reaches them.

## Standing contracts

- **The story is functional presentation** (ADR-0007) — animation makes
  effect resolution legible; the win banner always follows the final scene,
  never interrupts it (tickets 04, 05, 09).
- **`prefers-reduced-motion` disables all animation** — the log carries the
  moment (ADR-0007).
- **Privacy survives the story** — a peek/draw never leaks into another
  viewer's scene.
- **The round waits** — blocking is the story: each client drains its own
  queue; events arrive near-simultaneously so players stay roughly in sync.

## Tickets

| # | Ticket | Legacy | Status |
|---|---|---|---|
| 01 | latest-event-strip | was 19 | resolved |
| 02 | log-top-bar | was 21 | resolved |
| 03 | card-moment-animations | was 22 | resolved |
| 04 | scene-based-animations | was 23 | resolved |
| 05 | strip-follows-scene | was 24 | resolved |
| 06 | baron-compare-accuracy | was 27 | resolved |
| 07 | draw-animation | was 28 | resolved |
| 08 | reconnect-strip | was 31 | resolved |
| 09 | round-end-waits-for-story | was 37 | ready-for-agent |
| 10 | draw-appearance-sync | was 38 | ready-for-agent |

## Remaining scope

- **09 — Round/match-end overlay waits for the story.** The overlay renders
  only when the story has finished (`view.phase === 'roundEnded' &&
  !scenes.busy` + an anti-flash gate on the story reaching the round entry),
  so the final scene and win banner play unobstructed; the overlay is the
  action panel, the banner is the win beat — ordered, never overlapping.
- **10 — Draw appearance sync.** A single `useStory` seam with a lagged
  display view: draws enter the log, are *held* while the queue is busy
  (hand, deck count, seat counts keep pre-draw values), and *released* when
  the story reaches them; edges: the forced-Countess cancellation, the
  burned-card draw, two-draw bursts, reduced-motion/reconnect immediacy.
  (09 and 10 are independent and share the same seam's shape.)

## Testing strategy

`scenes.test.ts` / `story.test.ts` (mirroring suites) for grouping, held/
release ordering, and privacy; ui-smoke scenarios — scene plays through and
drains, strip sync (win line appears only at the win moment), reduced-motion
emulation disables scenes, no error banners.
