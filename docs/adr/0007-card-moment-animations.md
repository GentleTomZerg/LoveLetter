# 0007 — Card-moment animations are functional, not decorative

The client shipped under a "functional-clean" ethos: `index.css` opens with "No animations, just readable" and DESIGN.md Q15 records "no animations" as the UI-polish choice. One exception already existed — the reconnect `away-pulse` badge (issue 11), a functional signal.

Decision: card-moment animations (ticket 22) are a second, deliberate exception — a played/resolved card flies from one seat to another (or to its pile), a revealed card flashes at its seat, elimination dims the seat, round/match wins get a short fading banner. These are **functional**: they make effect resolution legible at a glance ("who did what to whom, and did it work") in a turn-based game where the action is otherwise only readable by scanning log text. Decorative animation — motion that carries no game information — stays out.

Two hard rules bind the exception:

- **`prefers-reduced-motion` disables all of it.** The media query gates every animation rule, and the client checks `matchMedia` before enqueuing; motion-sensitive players get today's text-only behavior. Nothing is lost without animation.
- **Only cards move; only what the viewer's own log shows.** Seats never fly — elimination is the existing out-state opacity transition. The animations derive from the viewer's own structured log entries (ADR-0003) and the public fact of which card each player last played; a peeked card never renders for a non-peeker. The engine and the event stream are untouched — this is pure client presentation.

Status: accepted. Source: grilling session Q6 (2025).

## Revision — scenes and verdict captions (ticket 23)

Ticket 23 reworks the ticket-22 mini-beats into **correlated scenes**: one play becomes one coherent animated moment that ends with the outcome, following a uniform three-step template — **Use** (the card lifts from the actor's hand) → **Travel & archive** (targeting cards sweep toward the target, then settle into the actor's discard pile; non-targeting cards fly straight to the pile) → **Effect** (the outcome beat with a short verdict caption, ~1.5s hold). The grouping is pure client presentation — the log stays one entry per event, ADR-0003 untouched.

This **revisits the declined "no captions" position**: the earlier session declined enriching resolution lines with cause/effect text (ADR-0003 note). The scene verdicts are a deliberate, recorded reversal of that for the *animation layer only* — "Hit! Bob had the Princess", "Alice's Baron vs Bob's Guard", "Hands swapped". The log lines themselves stay exactly as before; the caption is the animation's storyteller. Verdict text is localized (en + zh) through the same typed dictionaries as everything else (ADR-0004), and the `.self` variants handle the viewer as actor/target ("You are protected" vs "Alice is protected").

Two privacy adaptations, forced by the engine's information model:

- **A wrong Guard guess reveals nothing.** The approved caption "No — Bob had the Priest" would leak a card the client never receives — on a miss the engine reveals nothing (rules spec §4.1). The miss verdict reads "No — Bob didn't have the Priest" (about the guess, not the hidden card) and nothing flashes.
- **The Baron comparison shows only public cards.** Only the loser's hand is revealed (rules spec §4.3). When the target loses, both the played Baron and the loser's card flash side by side; when the Baron backfires, only the actor's own revealed card flashes; a tie reveals nothing (the caption says so).

Everything else carries over unchanged: reduced-motion disables all scenes, scenes are live-only (a reconnecting player never sees the past animate), the peeked card appears only on the Priest's chooser's screen, seats never fly (elimination is the existing out-state opacity transition — the tag/caption overlays narrate, they never carry a seat), and the win banner always follows the final scene — it never interrupts the story.

Status: accepted. Source: grilling session (ticket 23).

## Revision — resolutions always complete with an event (ticket 26)

Ticket 23's scene builder had to **infer** the outcome of a Guard miss and a Baron tie: those two resolutions emitted no engine event, so the animation layer guessed "miss/tie" from the *absence* of a reveal — a `resolving` state, a split sweep/verdict pair, a `forceVerdict` fallback fired when the sweep drained, and a deck-empty lookahead to tell a resolution's reveal from the round-end reveal. The log could not show those two outcomes at all.

Ticket 26 removes the gap at the source: **every resolution now ends with an explicit completion event.** The engine emits `guardMissed` and `baronTied` for the two formerly-silent outcomes (public — a miss reveals nothing, equal hands reveal nothing; each carries only `{playerId, targetId}`, the Guard's `guessRank`, and the played rank for the log line). The log folds them as `miss` / `tie` entries (ADR-0003), so **the log is a complete resolution transcript** — "A's Guard missed" and "A's Baron tied B" are written, never inferred.

The client inference chain is deleted — no `resolving` state, no `emitVerdict` clone, no `forceVerdict`, no drain-check, no deck-empty lookahead. The verdict arrives **as data** in the completion event, one frame after the resolution marker (the client folds one event per socket frame; marker and completion are in the same apply burst). A guard/baron/prince scene now emits **whole at its completion entry** — the three-step story in one scene — and the sweep starts one frame later than before, imperceptible. The King (its trade has no log entry) and the Priest (its `peek` entry is marker and completion in one) still emit whole at their single entry. The visuals are unchanged.

The completeness invariant — every branch of every card ends in a terminating event — is enforced by the per-card test suites, which assert exact event sequences (the completeness table below is the design contract):

| Card | Outcome branch | Terminating event(s) |
|---|---|---|
| Guard (1) | guess hit | `handRevealed` + `playerEliminated` |
| | guess miss | `guardMissed` |
| | no legal target | `cardFizzled` |
| Priest (2) | peek | `handPeeked` (×1–2) |
| | no legal target | `cardFizzled` |
| Baron (3) | win / backfire | `handRevealed` + `playerEliminated` |
| | tie | `baronTied` |
| | no legal target | `cardFizzled` |
| Handmaid (4) | played | `cardPlayed` (protection applied) |
| Prince (5) | discard + draw | `cardDiscarded` (+ `playerEliminated` on the Princess, `cardDrawn` on the draw) |
| King (6) | hands swapped | `handTraded` (×2) |
| | no legal target | `cardFizzled` |
| Countess (7) | forced discard | `cardDiscarded` (countess) |
| | played | `cardPlayed` (no effect) |
| Princess (8) | played | `playerEliminated` (princess) |

The Prince always has a legal target (it may target itself), so it never fizzles. This is a test-enforced invariant, not a type-enforced one — the table plus the per-card suites are the enforcement.

Status: accepted. Source: design discussion (ticket 26).
