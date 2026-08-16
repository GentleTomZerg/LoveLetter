# 28 — Draw animation: the new card is visible in the hand, but the draw is silent

**What to build:** a draw is currently invisible — the card just appears in the hand (or the hand count changes). The player cannot feel the draw: which card came in, that the deck shrank, that their hand changed. Add a functional draw moment: the drawn card moves from the deck to the player's hand. Per privacy, only the drawing player sees the card face-up; other viewers see a card-back flying to that player's hand. The deck count (already public, `game.deck`) drops as part of the moment. This rides the existing scene system (ticket 23) and the reduced-motion rule (ADR-0007 — no scene under `prefers-reduced-motion`).

**Blocked by:** 23 + 26 (the scene machinery and completion-events model it must plug into)

**Status:** ready-for-agent

- [x] Lightweight, non-blocking moment (no scene, no ticket-24 round pause): on the drawer's own screen the new card pops/highlights in the hand (~0.5s) and the header deck count pulses; other viewers just see the deck count move (public). The scene system stays untouched — played cards, forced discards, and reveals already have their scenes/flashes (ticket 23); the draw was the only silent hand change
- [x] The pop fires only for the drawer's own draw (self `cardDrawn`); the forced Countess discard right after a draw stays its own scene beat; no per-viewer payload needed (the card is already only on the drawer's stream)
- [x] Reduced motion: the pop/pulse are pure CSS keyed on the `prefers-reduced-motion` media query (ADR-0007) — nothing plays, and the round never blocks on them
- [x] Tests: reducer records the drawer's last draw (rank + key) on self `cardDrawn`; the pop class lands on the drawn card and clears after ~0.6s
- [x] ui-smoke: a draw produces the beat (face-up for the drawer, back for the other tab); none under reduced motion; no error banners
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Symptom (from to-discuss.md):** "When the player has take new cards from the deck, would their be a amimation? So, the player would know what card has been removed, and what has been in" — i.e. the draw is silent today; the player wants to *see* the card come in and go out of the deck.

**Context (2025):** the draw happens at every turn start (`turnStarted` + `cardDrawn` in the same burst, engine `finishTurn`/`startRound`) and for a Prince target mid-resolution. Two design questions for the maintainer: (1) does the drawer's own card show face-up (the "know what card has been in" ask) — and does that leak anything? A draw is private to the drawer by design, and the card becomes the player's own hand — showing it on their own stream leaks nothing; (2) should the beat also mark the deck shrinking (deck count is public), and where does the card fly from — a deck slot in the table panel? The table panel currently shows the deck only as a header count.

**Decision (design pass 2025):** lightweight pop + deck pulse — the drawer sees the new card pop in the hand (~0.5s) and the deck count pulse; others see the deck count move. The full fly-from-deck scene was rejected for now: it would add ~0.9s of ticket-24 blocking to every turn, and the deck has no visual anchor (it is a header number) — a fly would need a new table layout. Played/removed cards already have scenes (ticket 23); the draw was the only silent hand change.

**Implementation notes (ticket 28, 2025):** the `useGame` reducer records the drawer's own last draw (`lastDraw` + `drawSeq`, reset on hello/snapshot); the Game pops the matching hand card for ~0.6s (a pure CSS `card-drawn` animation — no scene, no ticket-24 pause) and keys the header deck-count span on a pulse counter so each draw restarts a short `deck-pulse` animation. Both animations are disabled under `prefers-reduced-motion`. Draws are the only silent hand change — played cards, forced discards, and reveals already have their scenes (ticket 23).
