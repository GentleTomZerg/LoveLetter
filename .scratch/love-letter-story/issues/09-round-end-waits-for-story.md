# 37 — Round/match-end overlay waits for the story

**What to build:** the round-end overlay ("You win the round" / "Start next round") and the match-end overlay ("Rematch") currently pop the instant `roundEnded`/`matchEnded` fold — `view.phase === 'roundEnded' && (…)` in Game.tsx — while the final scene (and the story banner) are still queued (~4.6s + 2.8s). The overlay sits at z-index 35 above the scenes layer (z 20), so it covers the caption and the banner mid-story, and the "Start next round" button is live while the story plays (also the real-world trigger half of ticket 32's race). Per ADR-0007 "the win banner always follows the final scene — it never interrupts the story"; the story banner already waits (queued after the final scene) — the overlay must wait too.

**Root cause:** two clocks — the state clock (the `useGame` reducer folds events instantly; `view.phase` flips on arrival) races the story clock (the scene queue plays at its own pace). The queue gates input (`busy`) and the strip (`currentEntry`) but not state-driven display; the overlay is pure state display.

**Blocked by:** none (uses `scenes.busy` from `usePlayScenes` today; ticket 38's `useStory` seam keeps the same shape)

**Status:** ready-for-agent

- [ ] The round-end overlay renders only when the story has finished — `view.phase === 'roundEnded' && !scenes.busy`: final scene + banner play unobstructed, then the panel appears; the match-end overlay gets the same gate
- [ ] Anti-flash: on the render where `view.phase` flips to `roundEnded`, the scenes enqueue a frame later (useEffect runs post-render), so `busy` is briefly false and the panel can flash for one frame — if visible, gate on "the story has reached the round entry" (a ref set when the round/match banner is enqueued) instead of raw `!busy`
- [ ] The story banner stays (Q3=A) — it is the strip-following win beat (ticket 24); the overlay is the action panel; they are ordered, never overlapping
- [ ] "Start next round" is not clickable mid-story (the button only exists on the delayed overlay); once visible, the ticket-32 double-click race remains and is handled there
- [ ] Reduced motion and reconnect stay instant: no scenes enqueued / the mount baseline skips history → `busy` false → the panel appears immediately
- [ ] Tests: ui-smoke — the round-end overlay appears only after the final scene + banner drain; the pre-drain overlay cannot be clicked (no button exists); reduced-motion and resume paths show the overlay immediately; no error banners
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Symptom (from to-discuss.md):** "The you win the round and start next round happens before the last card actions totally finished" — the panel popped while the final scene was still animating (and covered it).

**Decisions (grilling session — Q1, Q3, 2025):**
- **Q1** — gate the overlay on the story (A): `!scenes.busy`, so the panel waits for the final scene + banner. Rejected: fixed delays (drift from the actual queue), and instant-but-below-the-scenes (does not stop the mid-story click). The ~7s wait per round end is acceptable for a casual round-ender; ADR-0007's letter wins.
- **Q3** — keep the story banner AND the overlay (A): the banner is the story's win beat (the strip follows it); the overlay is the actionable panel; ordered, not racing.
- **Adjacency** — ticket 32 (next-round double-click race): the mid-story click that fed the race in practice is now impossible (no button during the story); the race itself remains on the button once visible and is handled by 32.

**Current state (facts for the implementer):** Game.tsx renders the overlays from `view.phase` with no gate; `.overlay` is z-index 35, `.scenes` is 20, so the story plays behind the panel. `usePlayScenes` exposes `busy` (`queue.length > 0`) and `currentEntry`; ticket 38's `useStory` re-exposes the same shape.
