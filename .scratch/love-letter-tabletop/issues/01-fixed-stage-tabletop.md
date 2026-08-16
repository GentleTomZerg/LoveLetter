# 1 — Fixed stage rework: zero-scroll tabletop with overlays

**Legacy:** was #33 in the love-letter effort.

**What to build:** the game screen becomes a fixed `100dvh` stage that **never scrolls** — the scene animations (love-letter-story/04) are always in view. The full log history, the rules manual (ticket 2), the round/match-end panels, and chat become **overlays** floating over the stage; the only in-flow content is the stage itself. Seats arrange as a **tabletop ring** around a **center table** (the deck, the burned card, the 2-player face-up removals as real cards); the top merges into **one bar** (log strip + room/round/deck + manual + leave); the **hand docks at the bottom** with the **choice panel in a slot** above it that never covers the seats; phones **lock to portrait**.

**Blocked by:** None — reworks the love-letter-story/02 top bar, the love-letter-client/08 scoreboard, and the love-letter-story/04 scene anchoring in place.

**Status:** resolved

- [x] Stage skeleton: `.screen.game` is `height: 100dvh; overflow: hidden` flex column — top bar (fixed) / middle band (flexible: seats ring + center table) / hand dock + choice slot (fixed bottom); the middle band is the only scrollable region, as a documented last resort (4 players on a tiny phone); the top bar, dock, and choice slot never leave the viewport
- [x] Merged top bar: one compact row — the log strip (newest entry, tappable → full-log modal) + room/round/deck + 手册/Manual button + leave; replaces the current fixed log bar + header two-row stack (love-letter-story/02)
- [x] Tabletop ring: seats around a center table — 2p as a duel (opponent top, you at the dock), 3p triangle, 4p 2×2; each seat keeps name / tokens / turn / protected / out / pile / hand count; seat tiles compress (smaller pile thumbs ~2.2rem) to fit the band
- [x] Center table: the deck as a physical card-back stack + count, the burned card, and the 2p face-up removals as real card thumbs (replacing the text line) — the deck becomes the draw-animation anchor (love-letter-story/07)
- [x] Hand dock: the hand (up to 2 cards, ~8rem desktop / ~5.5rem phone via media query) + the love-letter-client/11 play bar at the bottom; the choice panel sits in a slot above the dock (appears when needed, never covering the seats)
- [x] Overlays: the expanded log history becomes a modal (the strip stays; tap opens it); the round/match-end panels become centered overlay cards ("Start next round" / "Rematch"); chat stays a pill + modal; the Abilities `<details>` panel is removed in ticket 2 (the manual replaces it)
- [x] Scene anchoring: the `.scenes` layer anchors to the stage (always in the viewport); seat measurement (`seatCenter` in PlayScenes) adapts to the ring arrangement; fly paths (actor → via target → actor's pile) stay correct across 2–4 seats
- [x] Portrait lock: on narrow screens (`orientation: landscape` + narrow width) show a "rotate your phone" notice instead of the stage
- [x] ui-smoke: desktop has no scroll (all stage elements within the viewport); the ring seats and center-table cards render rank-keyed; the log modal and the round-end overlay open/close; a scene plays fully visible; the portrait-lock notice appears on a narrow landscape viewport; no error banners
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session — Q1–Q11, 2025):**
- **Q1** — fixed stage + overlays (A): the stage never scrolls; the full log history, the manual, the round/match-end panels, and chat are overlays
- **Q2** — the manual is one popup with three sections: quick rules + the eight cards + the four adopted rulings (Q17); opened from the top bar (ticket 2)
- **Q3** — desktop AND phone both zero-scroll with the same structure (compact sizing); tight edges documented, not silently accepted
- **Q4** — overlay inventory confirmed; the round/match-end panels are centered overlay cards
- **Dashboard** — tabletop ring: seats around a center table; 2p duel / 3p triangle / 4p 2×2
- **Q6** — the choice panel is a slot above the hand dock, never covering the seats (choosing a target requires the table visible); hand ~8rem desktop / ~5.5rem phone
- **Q7** — one merged top bar: log strip + room/round/deck + manual + leave
- **Q8** — the center table holds the deck (card-back stack + count), the burned card, and the 2p face-up removals as real cards — the deck becomes the love-letter-story/07 draw anchor
- **Q9** — phones force portrait; the middle band is the only flexible region with internal scroll as the documented last resort
- **Q10** — split into the stage ticket and the manual ticket
- **Q11** — this record; a fresh session implements

**Current state (facts for the implementer):** `.screen.game` is max-width 1080px with `padding-top: 4.5rem` clearing the fixed `.log-panel`; the `.scenes` layer is `position: absolute; inset: 0` inside it — the container is taller than the viewport, so scrolling carries the animation out of view (the root of the complaint); the scoreboard is `.scoreboard .seat` rows that grow as piles wrap; the hand is `min-height: 13rem` with 9rem cards; the log is a `<details>` expanding in place; the Abilities panel is a `<details>`.

**Implemented (2025):** the stage is now `height: 100dvh; overflow: hidden` flex column (`bar / band / bottom`), so the `.scenes` layer is always in view. The ring is a 3-column grid (`1fr auto 1fr`) with per-count `grid-template-areas`: `.duel` (2p: opponent top, you at the dock), `.triangle` (3p), `.square` (4p); `ringPositions` rotates the seats so the viewer always sits at the bottom. The center table holds the deck stack + pulsing count, the burned card, and the 2p face-ups as real thumbs; the deck count also stays in the top bar (Q7 + Q8 both). The log is a strip pill in the top bar + a modal (the list stays in the DOM, hidden, so the strip/modal/`logText` agree); round/match ends are centered overlay cards. The Manual button opens a modal carrying the current abilities content (ticket 2 swaps in the three-section manual and deletes the `<details>`, which now rides at the bottom of the band).

- **Implementation decisions:** the choice slot is **in-flow** above the dock (not an overlay) — the letter of "never covering the seats" wins; the band gives way and the table row (`minmax(0,1fr)`) absorbs the shrink. The portrait-lock media query is `(orientation: landscape) and (max-width: 932px) and (max-height: 500px)` — headless Chrome's default 780×493 is such a viewport, so `openRoom` now runs the smoke at 1280×800 and the lock is asserted explicitly at 812×375. Hand cards: 8rem on tall desktops, 6rem on ≤820px-tall viewports, 5.5rem on ≤640px-wide phones. The top bar sits above the round/match overlays (z 36 > 35) so leave/manual/log stay reachable between rounds; the chat pill floats above them too (z 38).
- **ui-smoke notes:** the round-end overlay is **observed before consumption** (`playOneMove(tab, true)` skips the auto-"Start next round" click) — the auto-click races the done-check (the `roundStarted` reset lands between the check and the click, so a playUntil done-condition never sees the overlay). The same pattern fixed runSceneBlocking phase 3. The pile snapshot requires a live round (no overlay) for the same reason.
- **Verification:** core 151/151, client 53/53, server smoke OK, ui-smoke OK (fixed-stage scenario asserts zero-scroll, rank-keyed ring, log modal + round-end overlay + manual modal open/close, scene fully visible, portrait lock; the runFixedStage geometry was eyeballed at 1280×800 / 375×812 / 320×568 — the ring fits the band on desktop and phone-portrait; a 320×568 phone uses the band's internal scroll, the documented last resort).
