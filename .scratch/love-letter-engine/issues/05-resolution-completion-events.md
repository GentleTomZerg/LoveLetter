# 26 — Resolution completion events (no resolution ends silent)

**What to build:** every targeting resolution ends with an explicit completion event, so no resolution is "complete but silent". Today a wrong Guard guess and a Baron tie emit **no event at all** — the log shows nothing, and the scene animations (ticket 23) had to infer completion from the next log entry, which is the entire source of the `resolving` / `emitVerdict` / `forceVerdict` inference machinery. Add public completion events for the silent outcomes, map them to log entries so the log is a complete resolution transcript, and let the animation layer consume the data instead of the heuristic.

**Blocked by:** None — reworks the ticket-23 animation inference in place; touches the engine event model (ADR-0003's one-event-one-entry is preserved: each new event is one new entry).

**Status:** ready-for-agent

- [x] Engine: emit a **public** completion event when a resolution ends without a consequence — Guard miss (`resolveGuardChoice`, wrong guess) and Baron tie (`resolveBaronChoice`, equal hand values). Granularity decision: two specific events (`guardMissed` / `baronTied`) — they read better in the log and match the per-card kind style. Events carry no card payload (a miss reveals nothing — privacy) — only `{playerId, targetId}`, the Guard's `guessRank`, and the played `rank` (public, for the log line)
- [x] reduceView: map the new events to log entries (`miss` / `tie` kinds) — the log becomes a complete transcript: "A's Guard missed" and "A's Baron tied B" are written, not inferred from absence
- [x] Log format: the new kinds render in en + zh (type-checked against the key set, ADR-0004); the scene-verdict strings reuse the same text where they overlap
- [x] Client scenes: delete the inference chain — `resolving` state, `emitVerdict` clone, `forceVerdict`, and the advance-hook sweep-drain check. The verdict now arrives as data in the completion event (same apply as the marker, one socket frame later), so a guard/baron/prince scene is emitted **whole** at the completion entry — the split sweep/verdict is unified. Keep the exact same visuals (sweep with the accusation tag → outcome flash → caption)
- [x] ADR: record the decision — resolutions always complete with an event; the log is a complete resolution transcript. ADR-0003's declined "enrich resolution lines with cause/effect" note revisited for the silent outcomes only (scoped exception); ADR-0007 revision records the simplification and the completeness table
- [x] Tests: core — guard miss and baron tie emit the event in 2p/3p/4p and deck-empty end-of-round combos, with no private card leaked; view — the log entries appear with the right params; client — the scene builder produces the miss/tie verdict from the completion event with no forcing; i18n — the new log lines render in en + zh
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Decision (design session 2025):** option B chosen — the engine emits completion events for the silent outcomes (Guard miss, Baron tie). Root cause: miss/tie are the only resolutions with no consequence event, so the log cannot show them and the presentation layer (ticket 23) had to infer completion from the next entry. Rejected: option A (keep as-is, document the inference — leaves the gap) and option C (synthesize log entries in reduceView without a backing event — violates ADR-0003 "the log is a projection of events" and would break replay consistency). The completion event is faithful to the tabletop game: on a miss the target simply stays in, which everyone observes.

**Decisions (design discussion 2025, before implementation):**

- **Events named `guardMissed` / `baronTied`** (ticket text said `cardMissed` / `cardTied` — by the ticket's own "match the per-card kind style" criterion, `baronTied` reads better: the *comparison* ties, not the card; the log kinds are already `guard`/`baron`)
- **Log lines name the played card** — events carry the played `rank` (public) so the miss line renders "A's Guard missed — B didn't have the X" and the tie line "A's Baron tied B", self-contained per ADR-0003 (params exactly as carried); `.self` variants avoid the possessive on "You"
- **Scene unification point is the completion entry, not the marker** — the client folds one event per socket frame (marker and completion are separate batches but the same apply burst), so a guard/baron/prince scene emits whole when the completion arrives; the sweep starts one frame later, imperceptible; the King (no log entry for its trade) and the Priest (`peek` is marker+consequence in one) still emit whole at their single entry
- **ADR record in place**: ADR-0003 note amended (scoped exception for the two silent outcomes, general cause/effect enrichment stays declined); ADR-0007 revision appended (completion events, deleted inference chain, completeness table — every card branch ends in a terminating event)
