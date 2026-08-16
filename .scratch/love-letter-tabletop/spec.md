# Love Letter — Tabletop (the fixed-stage rework)

**Status:** done — 5/5 tickets resolved

**Type:** spec

**Effort:** love-letter-tabletop

## Problem Statement

The game screen was a scrolling column: the scene animations (story feature)
drove off-screen, the scoreboard and discards were two separate panels, and
the manual was a collapsible list. The table should feel like a table — a
fixed stage that never scrolls, seats arranged around a center table, the
viewer's own seat at the bottom, and the rules one tap away.

## Solution

The game screen is a fixed `100dvh` stage (bar / band / bottom) where the
scenes layer is always in view; everything else floats as an overlay.

- **Fixed stage** (ticket 01) — seats form a tabletop ring around a center
  table (the deck as a physical card-back stack + count, the burned card, the
  2p face-up removals); the top bar merges log strip + room/round/deck +
  manual + leave; log history, round/match-end panels, and chat are overlays;
  phones lock to portrait with a rotate notice.
- **Rules manual** (tickets 02, 05) — one popup, three sections (quick rules,
  the eight cards with deck counts from core data, the four adopted rulings),
  localized en + zh; the old Abilities `<details>` is removed.
- **Own-seat dock + tap-the-seat** (ticket 03) — the viewer's own seat lives
  in the bottom dock (name, hearts, badges, own pile) and leaves the ring;
  opponents take the freed space in a symmetric top row; choices become
  tap-the-seat (legal target tiles light; the Guard's second step is name
  chips); play becomes an on-card chip with regret.
- **Phone polish** (ticket 04) — piles wrap like real stacks, the seat
  header is one line, animation pacing slows, the draw pop waits for the
  previous scene, and the center table collapses to one compact row.

## Standing contracts

- **The stage never scrolls** — the middle band is the only scrollable
  region, as a documented last resort on tiny phones.
- **The choice slot never covers the seats** — choosing a target requires
  the table visible.
- **The deduction surface never shrinks** — pile thumbs stay readable; only
  packing tightens.
- **DOM hooks are stable** — the ui-smoke contract (`data-player-id`,
  `.tokens` containing `♥`, `.seat` rows, …) is frozen; presentation adapts
  to it.

## Tickets

| # | Ticket | Legacy | Status |
|---|---|---|---|
| 01 | fixed-stage-tabletop | was 33 | resolved |
| 02 | rules-manual | was 34 | resolved |
| 03 | own-seat-dock | was 35 | resolved |
| 04 | phone-polish | was 36 | resolved |
| 05 | card-counts-in-manual | was 39 | resolved |

## Testing strategy

ui-smoke `fixedStage` scenario: zero-scroll geometry, rank-keyed ring and
center-table cards, log/round-end/manual overlays open and close, a scene
plays fully visible, the portrait-lock notice appears on a narrow landscape
viewport, no error banners. Deck counts render from `CARD_COUNTS` (core data),
so no new unit seam is needed (ticket 05).

## Out of Scope

Scene logic and the narration layer (`love-letter-story`), gameplay changes,
and new visual design beyond the functional stage (the reskin effort is
`love-letter-visual-redesign`).
