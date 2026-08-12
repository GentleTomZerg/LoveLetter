# 33 — Fixed stage rework: zero-scroll tabletop with overlays

**What to build:** the game screen becomes a fixed `100dvh` stage that **never scrolls** — the scene animations (ticket 23) are always in view. The full log history, the rules manual (ticket 34), the round/match-end panels, and chat become **overlays** floating over the stage; the only in-flow content is the stage itself. Seats arrange as a **tabletop ring** around a **center table** (the deck, the burned card, the 2-player face-up removals as real cards); the top merges into **one bar** (log strip + room/round/deck + manual + leave); the **hand docks at the bottom** with the **choice panel in a slot** above it that never covers the seats; phones **lock to portrait**.

**Blocked by:** None — reworks the ticket 21 top bar, the ticket 14 scoreboard, and the ticket 23 scene anchoring in place.

**Status:** ready-for-agent

- [ ] Stage skeleton: `.screen.game` is `height: 100dvh; overflow: hidden` flex column — top bar (fixed) / middle band (flexible: seats ring + center table) / hand dock + choice slot (fixed bottom); the middle band is the only scrollable region, as a documented last resort (4 players on a tiny phone); the top bar, dock, and choice slot never leave the viewport
- [ ] Merged top bar: one compact row — the log strip (newest entry, tappable → full-log modal) + room/round/deck + 手册/Manual button + leave; replaces the current fixed log bar + header two-row stack (ticket 21)
- [ ] Tabletop ring: seats around a center table — 2p as a duel (opponent top, you at the dock), 3p triangle, 4p 2×2; each seat keeps name / tokens / turn / protected / out / pile / hand count; seat tiles compress (smaller pile thumbs ~2.2rem) to fit the band
- [ ] Center table: the deck as a physical card-back stack + count, the burned card, and the 2p face-up removals as real card thumbs (replacing the text line) — the deck becomes the draw-animation anchor (ticket 28)
- [ ] Hand dock: the hand (up to 2 cards, ~8rem desktop / ~5.5rem phone via media query) + the ticket-25 play bar at the bottom; the choice panel sits in a slot above the dock (appears when needed, overlaying the lower table, never covering the seats)
- [ ] Overlays: the expanded log history becomes a modal (the strip stays; tap opens it); the round/match-end panels become centered overlay cards ("Start next round" / "Rematch"); chat stays a pill + modal; the Abilities `<details>` panel is removed in ticket 34 (the manual replaces it)
- [ ] Scene anchoring: the `.scenes` layer anchors to the stage (always in the viewport); seat measurement (`seatCenter` in PlayScenes) adapts to the ring arrangement; fly paths (actor → via target → actor's pile) stay correct across 2–4 seats
- [ ] Portrait lock: on narrow screens (`orientation: landscape` + narrow width) show a "rotate your phone" notice instead of the stage
- [ ] ui-smoke: desktop has no scroll (all stage elements within the viewport); the ring seats and center-table cards render rank-keyed; the log modal and the round-end overlay open/close; a scene plays fully visible; the portrait-lock notice appears on a narrow landscape viewport; no error banners
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session — Q1–Q11, 2025):**
- **Q1** — fixed stage + overlays (A): the stage never scrolls; the full log history, the manual, the round/match-end panels, and chat are overlays
- **Q2** — the manual is one popup with three sections: quick rules + the eight cards + the four adopted rulings (Q17); opened from the top bar (ticket 34)
- **Q3** — desktop AND phone both zero-scroll with the same structure (compact sizing); tight edges documented, not silently accepted
- **Q4** — overlay inventory confirmed; the round/match-end panels are centered overlay cards
- **Dashboard** — tabletop ring: seats around a center table; 2p duel / 3p triangle / 4p 2×2
- **Q6** — the choice panel is a slot above the hand dock, never covering the seats (choosing a target requires the table visible); hand ~8rem desktop / ~5.5rem phone
- **Q7** — one merged top bar: log strip + room/round/deck + manual + leave
- **Q8** — the center table holds the deck (card-back stack + count), the burned card, and the 2p face-up removals as real cards — the deck becomes the ticket-28 draw anchor
- **Q9** — phones force portrait; the middle band is the only flexible region with internal scroll as the documented last resort
- **Q10** — split into #33 (stage) and #34 (manual)
- **Q11** — this record; a fresh session implements

**Current state (facts for the implementer):** `.screen.game` is max-width 1080px with `padding-top: 4.5rem` clearing the fixed `.log-panel`; the `.scenes` layer is `position: absolute; inset: 0` inside it — the container is taller than the viewport, so scrolling carries the animation out of view (the root of the complaint); the scoreboard is `.scoreboard .seat` rows that grow as piles wrap; the hand is `min-height: 13rem` with 9rem cards; the log is a `<details>` expanding in place; the Abilities panel is a `<details>`.
