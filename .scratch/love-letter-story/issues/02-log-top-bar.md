# 2 — Log moves to a fixed top bar

**Legacy:** was #21 in the love-letter effort.

**What to build:** the latest-event strip + expandable log (ticket 1) moves out of the bottom of the game column and becomes a full-width bar fixed at the top of the screen, so the latest event is visible without scrolling at any screen size. The game content sits below it. Clicking the bar still expands the full history in place.

**Blocked by:** None — can start immediately (extends the resolved ticket 1 component).

**Status:** resolved

- [x] Fixed full-width top bar: the strip content is unchanged from ticket 1 — newest entry rendered via `t`, mini card thumbnail when the entry carries a rank, muted placeholder when the log is empty, activity lines (disconnect/reconnect) participating — but the bar now floats at the top of the viewport and the game content gains top padding so the header and table sit below it
- [x] Click → the full history drops in a panel fixed beneath the bar (newest-first, scrollable, `.log` max-height applies to the expanded panel); click again → collapse; on phones (≤640px) the expanded panel is near-fullscreen, following the chat-dialog precedent
- [x] The bar stays visible while the table scrolls under it; the expanded panel and the scroll position behave on both desktop and narrow phones
- [x] ui-smoke: update `runLogStrip` for the new position — the bar is visible without scrolling, expand/collapse still works, the expanded panel renders; no error banners
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session 2025):** Q1 → floating strip (A), not in-flow reorder; Q2 → full-width top bar (A1), not header-integrated. Rationale: a floating bar is the only option where "never scroll" holds at every viewport height — on phones the hand must stay near the bottom for thumb reach. Expansion keeps the `<details>` in-place pattern; phone near-fullscreen follows the chat dialog's 640px rule.

**Implemented (2025):** CSS-only — `.log-panel` (the `<details>` element) is now `position: fixed; top: 0; left: 0; right: 0; z-index: 30` with a bottom border + shadow; `.screen.game` gains `padding-top: 4.5rem` so the header clears the bar; the strip and the expanded `.log` are centered at `max-width: 1080px`; a `≤640px` media query makes `.log-panel[open]` stretch to the viewport bottom with `.log { flex: 1 }` — near-fullscreen, the bar staying as the toggle on top. The JSX is untouched (fixed positioning removes the log from flow).

- **Review fixes:** `.error-banner` on the game screen now sticks below the bar (`top: 2.5rem` via `:has(+ .screen.game)`) so a rejected-intent error stays visible and clickable; stale "under the table" comments in the ui-smoke header updated.
- **Verification:** typecheck clean, client 13/13, core 136/136, server smoke OK, ui-smoke OK — `runLogStrip` now asserts the bar is pinned (`rect.top === 0`), the content clears it, expand/collapse works, and the expanded panel is near-fullscreen at 375×812.
- **Human pass (unchecked):** eyeball the bar + expanded panel on a real phone (status-bar overlap).
