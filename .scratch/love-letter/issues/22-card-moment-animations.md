# 22 — Card-moment animations

**What to build:** card events animate the moment they land live, so the outcome of a play is legible at a glance. A card thumbnail leaves the acting player's seat and travels to where the card goes — the target's seat for targeting plays (Guard/Baron/Prince/King), that player's discard pile for untargeted plays (Princess, forced Countess); reveals flash the card at the seat; eliminations dim the seat in place; round/match wins get a short banner fade. Beats queue one at a time; the sequence itself is the verdict — no verdict captions, no cause/effect enrichment.

**Blocked by:** None — can start immediately (client-only; the animation layer measures seat positions at animation start, so it adapts to the ticket 21 layout whether or not 21 lands first).

**Status:** resolved

- [x] Live-only: only log entries arriving while the viewer is in the room animate; the replayed history on resume/reconnect never replays as animation
- [x] Targeted plays (guard/baron/prince/king) fly the card thumbnail from the actor's seat to the target's seat; untargeted plays (fizzle, princess discard, forced countess) fly to that player's discard pile; reveal flashes the card at the seat; eliminate dims the seat (a smooth transition to the existing out state); round/match wins get a short banner fade
- [x] Only cards move — seats never fly; informational entries (choice, join, leave, info) stay text-only
- [x] Bursts queue one beat at a time (~1.5s each, last beat fades); back-to-back turns stay readable
- [x] `prefers-reduced-motion` disables all motion — the log bar text carries the moment, exactly as today
- [x] Privacy: an animation shows only what the viewer's own log already shows (a peek card never leaks to non-peekers)
- [x] ADR-0007 written: card-moment animations are functional (they make effect resolution legible), not decorative; decorative animation stays out; the `index.css` header comment and DESIGN.md Q15 ethos texts updated truthfully to match
- [x] ui-smoke: the flying element appears and disappears; reduced-motion emulation disables the animation; no error banners
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session 2025):** Q3 → scope is all card moments (b), informational lines stay text-only; only cards fly (the user's amendment — players never move). Q4 → per-event unfolding (a), no correlated moments, no verdict captions — the sequence is the verdict; ADR-0003 stays untouched. Q5 → queue one beat at a time (a), live-only. Q6 → animate by default, respect `prefers-reduced-motion`, record the ethos reversal as an ADR (a).

**Implemented (2025):** new pure seam `moments.ts` maps each fresh log entry to ≤1 moment (fly/flash/banner or none) via a small reducer with a `lastPlayed` fact cache — the engine's `baron`/`prince`/`king`/`peek` resolution entries carry no rank, and the cache (public info) gives the fly its card art; this is a fact cache, not moment correlation, so ADR-0003's one-event-one-entry rule is untouched. `PlayMoments` diffs the log tail live-only (mount baseline skips the replayed history), enqueues every beat (no cap — a match-end burst still plays through), renders only the head, and advances on `animationend` with a backstop timer (covers a mid-flight reduced-motion toggle that cancels the CSS animation). Fly/flash measure seat rects against the `.moments` layer at mount; seats carry `data-player-id` for lookup. All keyframes sit behind `@media (prefers-reduced-motion: no-preference)`; elimination dims the seat via a transition on the existing `.out` state. ADR-0007 records the ethos exception; `index.css` header + DESIGN.md Q15 updated.

- **Headless quirk (fixed in tooling, not product):** headless Chrome starts pages with `visibilityState: hidden`, which freezes *all* CSS animation clocks (no `animationend`); `cdp.ts` now brings tabs to the front so animation-driven scenarios behave like a real tab.
- **Review fixes:** the ui-smoke reduced-motion phase originally measured non-empty-pile count, which caps at the seat count and can never exceed a full baseline (a round reset only drops it) — the spec reviewer caught a hang and it now measures log-text growth; extracted a shared `layerRect` helper; removed the queue cap that silently dropped beats; added the beat backstop timer.
- **Verification:** typecheck clean, client 22/22 (9 new mapping tests incl. peek privacy), core 136/136, server smoke OK, ui-smoke OK incl. `runCardMoments` (moment appears mid-play and is rank-keyed, drains on its own, none appear under reduced-motion emulation).
- **Known edges (accepted):** toggling reduced motion mid-flight keeps `lastPlayed` stale until the next play (self-correcting); live-only replay protection is by construction (mount baseline + the `lastEventId` fold guard) rather than smoke-asserted.
- **Human pass (unchecked):** watch a full round on desktop and a phone — fly arcs, flash pop, banner pacing, and whether the story reads.
