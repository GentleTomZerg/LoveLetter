# 19 — Latest-event strip + expandable log

**What to build:** the game log collapses to a single "latest event" line under the table; clicking expands the full history in place (grilling Q2, Q10, Q11). The strip renders the newest entry from its params with a mini card thumbnail; room-activity lines stay merged.

**Blocked by:** 15 (needs structured entries + dictionary)

**Status:** ready-for-agent

- [ ] Collapsed strip: newest log entry rendered via `t` with a mini card thumbnail when the entry has a card rank; muted placeholder when the log is empty (lobby)
- [ ] Click → expands in place (the `<details>` pattern from the Abilities panel), newest-first, keeping the current max-height scroll; click again to collapse
- [ ] Activity lines (disconnects/reconnects) participate in the strip exactly like log entries
- [ ] Layout: the strip sits where the log is today (bottom of the main column); `.log` max-height applies to the expanded state
- [ ] ui-smoke additions or manual two-tab check: newest entry tracks live play; expanded log matches today's list
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session 2025):** Q2 two separate elements (log strip stays under the table, chat floats — see ticket 20). Q10 show the single newest line rendered from params with a thumbnail, not a plain-text line or a ticker. Q11 expand in place, newest-first. Log entries stay one-per-event (Q16 declined chain enrichment — see ADR-0003 note).
