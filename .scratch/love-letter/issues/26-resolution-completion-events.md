# 26 — Resolution completion events (no resolution ends silent)

**What to build:** every targeting resolution ends with an explicit completion event, so no resolution is "complete but silent". Today a wrong Guard guess and a Baron tie emit **no event at all** — the log shows nothing, and the scene animations (ticket 23) had to infer completion from the next log entry, which is the entire source of the `resolving` / `emitVerdict` / `forceVerdict` inference machinery. Add public completion events for the silent outcomes, map them to log entries so the log is a complete resolution transcript, and let the animation layer consume the data instead of the heuristic.

**Blocked by:** None — reworks the ticket-23 animation inference in place; touches the engine event model (ADR-0003's one-event-one-entry is preserved: each new event is one new entry).

**Status:** ready-for-agent

- [ ] Engine: emit a **public** completion event when a resolution ends without a consequence — Guard miss (`resolveGuardChoice`, wrong guess) and Baron tie (`resolveBaronChoice`, equal hand values). Granularity decision: two specific events (`cardMissed` / `cardTied`) vs one generic `effectResolved {kind, outcome}` — recommendation: two specific, they read better in the log and match the per-card kind style. Events carry no card payload (a miss reveals nothing — privacy) — only `{playerId, targetId}` plus the Guard's `guessRank` (already public)
- [ ] reduceView: map the new events to log entries (`miss` / `tie` kinds) — the log becomes a complete transcript: "A's Guard missed" and "A's Baron tied B" are written, not inferred from absence
- [ ] Log format: the new kinds render in en + zh (type-checked against the key set, ADR-0004); the scene-verdict strings can reuse the same text where they overlap
- [ ] Client scenes: delete the inference chain — `resolving` state, `emitVerdict` clone, `forceVerdict`, and the advance-hook sweep-drain check. The verdict now arrives as data in the completion event's batch (same apply as the marker, microseconds later), so a guard/baron/prince scene can be emitted whole with its verdict known — the split sweep/verdict may be unified again. Keep the exact same visuals (sweep with the accusation tag → outcome flash → caption)
- [ ] ADR: record the decision — resolutions always complete with an event; the log is a complete resolution transcript. Revisit ADR-0003's declined "enrich resolution lines with cause/effect" note for the silent outcomes only, and note the simplification of ADR-0007's animation section
- [ ] Tests: core — guard miss and baron tie emit the event in 2p/3p/4p and deck-empty end-of-round combos, with no private card leaked; view — the log entries appear with the right params; client — the scene builder produces the miss/tie verdict from the completion event's batch with no forcing; ui-smoke still green
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Decision (design session 2025):** option B chosen — the engine emits completion events for the silent outcomes (Guard miss, Baron tie). Root cause: miss/tie are the only resolutions with no consequence event, so the log cannot show them and the presentation layer (ticket 23) had to infer completion from the next entry. Rejected: option A (keep as-is, document the inference — leaves the gap) and option C (synthesize log entries in reduceView without a backing event — violates ADR-0003 "the log is a projection of events" and would break replay consistency). The completion event is faithful to the tabletop game: on a miss the target simply stays in, which everyone observes.
