# 4 — Scene-based card animations (three-step template)

**Legacy:** was #23 in the love-letter effort.

**What to build:** replace the ticket 3 per-entry mini-beats with correlated **scenes** — one play becomes one coherent animated moment that ends with the outcome. Every card follows the same three steps: **Use** (the card lifts from the actor's hand) → **Travel & archive** (targeting cards sweep toward the target, then settle into the actor's discard pile; non-targeting cards fly straight to the pile) → **Effect** (the outcome beat with a short verdict caption, ~1.5s hold). The log entries stay one-per-event — the grouping is pure client-side presentation (ADR-0003 untouched); the verdict captions revisit the earlier "no captions" decision, recorded in ADR-0007.

**Blocked by:** None — reworks the ticket 3 implementation in place.

**Status:** resolved

- [x] Scene builder: group each targeting resolution (guard/baron/prince/king/peek) with the entries that resolve it (reveals, eliminate, discards); a scene closes at the next resolution/play or round boundary; a fizzle is its own mini-scene; non-targeting plays (handmaid/countess/princess) are single-card scenes
- [x] Uniform three-step scenes: the played card always ends visibly in the actor's discard pile; the effect beat holds ~1.5s before the scene drains
- [x] Guard: the guess appears as a tag at the target ("accuses Bob of the Princess?"); hit → "Hit! Bob had the Princess" + flash + seat dim; miss → "No — Bob didn't have the Princess" (no flash — the engine reveals nothing on a wrong guess; recorded in ADR-0007) + seat dim
- [x] Priest: the peeked card appears face-up at the target **only on the peeker's own screen**; other viewers see the peek happen with no card
- [x] Baron: both cards flash side by side ("Alice's Baron vs Bob's Guard") and the loser's seat dims; backfire/tie variants adapt when only the loser's card is public
- [x] King: the King plays to the pile first, then the two hand cards cross paths ("Hands swapped")
- [x] Handmaid → existing protected badge appears; Prince → the target's forced discard flies to their pile; Countess → flies to the pile ("forced"); Princess → flies to the pile then the seat dims ("is out")
- [x] New localized verdict strings in en + zh (type-checked against the key set); reduced-motion still disables all scenes; live-only (no replay on resume)
- [x] ADR-0007 updated: scenes + verdict captions are functional presentation; the declined "no captions" position is revisited and recorded
- [x] ui-smoke: a scene plays through (card appears, archives to the pile, verdict appears, drains), art stays rank-keyed; none under reduced-motion emulation
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session 2025):** the log stays exactly as it is — the *animation* is the storyteller. Scenes (Q2-a): correlated, one per card, ending with the outcome. Uniform three-step template (the user's design): use → travel & archive → effect. Per-card table approved with the King corrected (the King plays to the pile, then the hands cross — its participation is never lost). The win moment always follows the final scene — it never interrupts the story.

**Status flipped to resolved (2026-08-16):** implementation and verification are recorded above; the tracker status lagged the commits (see `git log` for the ticket-23 commits).
