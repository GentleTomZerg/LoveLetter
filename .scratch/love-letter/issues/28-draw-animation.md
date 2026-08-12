# 28 — Draw animation: the new card is visible in the hand, but the draw is silent

**What to build:** a draw is currently invisible — the card just appears in the hand (or the hand count changes). The player cannot feel the draw: which card came in, that the deck shrank, that their hand changed. Add a functional draw moment: the drawn card moves from the deck to the player's hand. Per privacy, only the drawing player sees the card face-up; other viewers see a card-back flying to that player's hand. The deck count (already public, `game.deck`) drops as part of the moment. This rides the existing scene system (ticket 23) and the reduced-motion rule (ADR-0007 — no scene under `prefers-reduced-motion`).

**Blocked by:** 23 + 26 (the scene machinery and completion-events model it must plug into)

**Status:** needs-triage

- [ ] A draw is a scene beat: the card flies from the deck to the drawing player's hand — face-up on the drawer's own stream, a back for everyone else (per-viewer payload, like `peek`/`cardDrawn`)
- [ ] Draws inside another scene absorb cleanly (the Prince target's draw during the prince scene; the turn-start draw between turns; the forced Countess discard right after a draw — the discard stays its own beat)
- [ ] Reduced motion: no draw beat under `prefers-reduced-motion`; the round never blocks on it (it must not participate in ticket 24's busy blocking beyond the scenes that already block)
- [ ] Tests: scene builder emits the draw beat with the per-viewer card; no private card leaks; i18n lines render in en + zh
- [ ] ui-smoke: a draw produces the beat (face-up for the drawer, back for the other tab); none under reduced motion; no error banners
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Symptom (from to-discuss.md):** "When the player has take new cards from the deck, would their be a amimation? So, the player would know what card has been removed, and what has been in" — i.e. the draw is silent today; the player wants to *see* the card come in and go out of the deck.

**Context (2025):** the draw happens at every turn start (`turnStarted` + `cardDrawn` in the same burst, engine `finishTurn`/`startRound`) and for a Prince target mid-resolution. Two design questions for the maintainer: (1) does the drawer's own card show face-up (the "know what card has been in" ask) — and does that leak anything? A draw is private to the drawer by design, and the card becomes the player's own hand — showing it on their own stream leaks nothing; (2) should the beat also mark the deck shrinking (deck count is public), and where does the card fly from — a deck slot in the table panel? The table panel currently shows the deck only as a header count.
