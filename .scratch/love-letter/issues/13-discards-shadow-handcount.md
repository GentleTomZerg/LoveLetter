# 13 — Discards panel: shadowed piles + face-down hand-count

**What to build:** each player's row in the Discards panel should show their discarded cards as a shadowed, overlapping pile (reads like a real pile of cards), and beside it a small stack of face-down card backs showing how many cards that player currently holds.

**Blocked by:** none

**Status:** resolved

## Context

The `Discards` panel (`Game.tsx` `Discards()`) renders each player's `discardPile` as rank-keyed `CardThumb` images laid out flat side-by-side (`.discard-row .pile img` — no shadow, no overlap). Nothing anywhere shows how many cards a player is holding, so opponents' hand sizes are invisible even though in Love Letter hand size is public information every player is entitled to see — it's part of the deduction surface.

Reported from play: it's unclear what's going on at the table; a pile that looks like a pile of cards plus visible hand sizes would make the state readable at a glance.

## Gap: hand size isn't in the view

`PlayerView` (`packages/core/src/view.ts`) exposes `tokens`, `out`, `protected`, `discardPile` — but no hand size. Only your own hand is sent (`view.hand`). Showing hand count for **every** player needs a new public field:

- Add `handCount: number` to `PlayerView`; populate it in `buildView` from `state.players[i].hand.length`.
- Hand size is public in Love Letter, so it's safe to send for all players (the cards themselves stay private — only the count goes out).
- `reduceView` must keep it correct through the whole round: `cardDealt`, `cardDrawn`, `cardPlayed`, `cardDiscarded`, `handRevealed` (round-end reveal), `handTraded` (King), `roundStarted` reset. A unit test on the reducer should cover these.
- The self row can use `view.hand.length`; but using the same `handCount` field everywhere avoids two code paths.

## Fix direction

- **Shadowed discard pile** — overlap the thumbnails slightly (negative margin) and add a `drop-shadow` so a multi-card pile reads as a stack. Keep images clickable-tooltip-free (touch); no hover dependency.
- **Face-down hand backs** — render N `back-light.png` images (the same asset the burned-card display already uses) per player, where N = their `handCount`, plus a readable count (e.g. an overlay number or `×N` label) so the count isn't conveyed by image count alone — cards are small and 0 must be unambiguous (show a dash, like the empty pile today).
- Keep the existing "—" placeholder when a player has no discards and none in hand.
- Only the count is revealed for opponents — never card faces.

## Acceptance

- [x] Each player's row shows their discards as a shadowed, overlapping pile
- [x] Each player's row shows their hand size as face-down card backs plus an explicit count (zero reads as zero)
- [x] Hand sizes stay correct for all players through a full round (deal, draw, play, Prince discard, King trade, forced Countess, round-end reveal) — covered by a `reduceView` unit test
- [x] No hover/touch dependency; works on iPhone
- [x] No layout shift as piles grow; still responsive under 900px
- [x] `npm run ui-smoke` green; screenshot shows piles + hand backs

## Comments

Related to 14 (unify the scoreboard into this panel) — both target the same table state and are best implemented together so the row layout is designed once.

**Fixed (2025):** `PlayerView` gained `handCount` (`packages/core/src/view.ts`), populated in `buildView` and folded through every hand-size event — deal, draw (including the empty-deck burn draw), play, Prince/Countess discard, King trade, reveal, rematch reset. The King trade needed the event to carry the received hand's size: hands can be unequal (e.g. after a forced Countess discard), so `handTraded` now includes a public `count` field (`types.ts`, `engine.ts`; the server's privacy filter spreads the event and only nulls `card`, so the count reaches everyone). Unit tests: a dedicated hand-count lifecycle test plus the existing full-round test extended (`view.test.ts`), and the King test asserts the new count (`king.test.ts`).

UI: the `Discards` rows now render the discard pile as an overlapping stack with a drop shadow (`margin-left: -1.3rem` + `box-shadow`), and a `hand` group with face-down `back-light.png` cards matching `handCount` plus an explicit count badge (dash-free zero). One rename during implementation: the in-row group is `hand-info`, not `hand` — the bare `.hand` class would inherit the table-hand rule's `min-height: 13rem`. ui-smoke asserts both seats show counts 0-2, face-down backs equal total cards held, and the reload-resume snapshot now includes hand counts (replay fidelity). Implemented together with 14's unified panel — see 14's notes.

Verification: typecheck clean across workspaces, 117 core tests green, client build green, ui-smoke green (narrow phone layout, render checks, full 2p match, 3p/4p, reload/resume with hand counts restored).
