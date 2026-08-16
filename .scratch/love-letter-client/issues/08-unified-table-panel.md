# 14 — Unify turn + hearts (scoreboard) into the Discards panel

**What to build:** merge the two stacked table panels — the `Scoreboard` (names, hearts/tokens won, turn badge, protected/out) and the `Discards` panel — into one unified per-player table: a single panel where each row shows name, hearts won, whose turn it is, discards, and hand size.

**Blocked by:** none

**Status:** resolved

## Context

`Game.tsx` renders `<Scoreboard />` and then `<Discards />` as two separate `.panel`s. Reading the table state means scanning two panels, and the turn indicator is split across three places: a `turn-badge` in the scoreboard, a `turn-banner` in the table area, and the "It's your turn" prompt. Hearts won (`tokens / tokenTarget`) live only in the scoreboard. Reported from play: the turn and points feel disconnected from the discards — one unified panel would be clearer.

## Fix direction

- **One panel, one row per player** in play order. Each row:
  - name (self marked "you")
  - hearts won: `tokens / tokenTarget`
  - turn state: highlight the active player's row instead of relying on a small badge (keep an explicit "turn" marker too, so it isn't color-only — see accessibility)
  - discards + hand size (the shadowed pile + face-down hand backs from issue 13)
  - existing `protected` / `out` badges
- **Turn indicator** — pick one canonical visual per row (row highlight + marker). Decide what happens to the redundant in-table `turn-banner`: keep it only as the acting player's call-to-action, or drop it in favor of the row highlight — but don't leave two sources that could contradict.
- Keep the layout stable at 2–4 players and the existing sub-900px collapse. Chat panel untouched.
- No behavior change: still pure render from `ViewState`; no new data needed beyond issue 13's `handCount`.

## Acceptance

- [x] One unified panel replaces the separate scoreboard + discards: a single row per player with name, hearts, turn state, discards, and hand size
- [x] Whose turn it is is obvious at a glance, without relying on color alone
- [x] Duplicated/conflicting turn indicators resolved (one canonical per-row signal)
- [x] Protected/out states still visible; hearts show `tokens / tokenTarget`
- [x] Stable at 2–4 players, no overlap; responsive under 900px
- [x] `npm run ui-smoke` green; screenshot shows the unified panel

## Comments

Builds on 13's row content (shadowed discards + hand backs) — implement together so the row layout is designed once.

**Fixed (2025):** `Scoreboard` and `Discards` are now one `TablePanel` (`Game.tsx`), a single `.panel.scoreboard` titled “Table” with one `.seat` row per player: name (+ “(you)”), hearts `♥ tokens / tokenTarget`, the turn pill, protected/out badges, the shadowed discard pile, and the face-down hand backs + count from 13. The old chip-style `.seat` CSS became row-style (column panel, bordered rows).

Turn signal: the scoreboard's `turn-badge` moved into the unified row and the active player's row gets a highlight (`border-color: var(--ok)` + ring) *plus* the “turn” pill — never color alone. The in-table “It's your turn — play a card.” banner stays as the acting player's call-to-action (it's a CTA, not a table-state indicator), so the per-row pill is the single canonical state signal. ui-smoke asserts exactly one `.seat.turn` at round start, and that no bare `.hand` class exists inside seats (the min-height collision guard from 13). Reload/resume snapshot still passes with hand counts included.

Verification: typecheck clean across workspaces, 117 core tests green, client build green, ui-smoke green (all scenarios, no error banners).
