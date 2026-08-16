# 19 — Latest-event strip + expandable log

**What to build:** the game log collapses to a single "latest event" line under the table; clicking expands the full history in place (grilling Q2, Q10, Q11). The strip renders the newest entry from its params with a mini card thumbnail; room-activity lines stay merged.

**Blocked by:** 15 (needs structured entries + dictionary)

**Status:** resolved

- [x] Collapsed strip: newest log entry rendered via `t` with a mini card thumbnail when the entry has a card rank; muted placeholder when the log is empty (lobby)
- [x] Click → expands in place (the `<details>` pattern from the Abilities panel), newest-first, keeping the current max-height scroll; click again to collapse
- [x] Activity lines (disconnects/reconnects) participate in the strip exactly like log entries
- [x] Layout: the strip sits where the log is today (bottom of the main column); `.log` max-height applies to the expanded state
- [x] ui-smoke additions or manual two-tab check: newest entry tracks live play; expanded log matches today's list
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session 2025):** Q2 two separate elements (log strip stays under the table, chat floats — see ticket 20). Q10 show the single newest line rendered from params with a thumbnail, not a plain-text line or a ticker. Q11 expand in place, newest-first. Log entries stay one-per-event (Q16 declined chain enrichment — see ADR-0003 note).

**Implemented (2025):** the `Log` panel is now `<details class="panel log-panel">` — a `<summary class="log-strip">` shows the newest entry (via `t`, with a mini `CardThumb` when `entryRank` finds a card rank) and a muted placeholder when both sequences are empty; clicking expands the full newest-first history in place with its 16rem scroll height kept, click again to collapse. Activity lines ride the strip through `latestLogEntry` — by construction the strip is always the top of the expanded list (strip == first li asserted in ui-smoke).

- **New pure seam:** `entryRank` + `latestLogEntry` in `logFormat.ts`, 6 new vitest cases (rank-bearing kinds, no-rank kinds, out-of-range, all three latest branches) — client 13/13.
- **Verification:** typecheck clean, core 136/136, server smoke OK, ui-smoke OK including the new `runLogStrip` scenario. One transient pre-existing flake observed: `not your turn` in the untouched 3p/4p scenario — it passed on consecutive reruns and is unrelated to this change.
- **Notes:** the lobby placeholder is effectively unreachable (roomCreated + joins populate the log immediately) but implemented and unit-tested per the spec's letter; `latestLogEntry` keeps the today's-list convention (newest activity wins — no shared clock with the server log).
- **Human pass (unchecked):** eyeball the collapsed strip and expanded log on a narrow phone.
