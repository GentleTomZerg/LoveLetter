# 31 — Reconnect lines permanently win the top strip

**What to build:** after any disconnect/reconnect, the top strip is stuck on the reconnect line ("Alice reconnected") and never returns to the game log. Root cause confirmed: `latestLogEntry` (logFormat.ts) returns the newest **activity** line whenever any exists — `activity.length > 0 ? activity[last] : log[last]` — and room activity (issue 11's `playerGone`/`playerBack` lines) never shrinks, so the strip prefers a stale reconnect line over every later game entry. The expanded log has the same ordering (activity entries sort above game entries). The strip should show the newest *arrived* line regardless of which sequence it belongs to; activity is only "newer" at the moment it arrives.

**Blocked by:** none

**Status:** ready-for-agent

- [x] The strip (and the expanded list's top) show the genuinely newest entry across both sequences — a client-side **arrival order** shared by game events and activity lines (`arrivalSeq` + `logArrivals` in the `useGame` reducer; activity lines carry their stamp inline), so an activity line wins only until the next game event lands (and vice versa)
- [x] Ticket 24's beat override still wins during scenes, unchanged
- [x] A reconnect mid-game no longer freezes the strip; a fresh play replaces the reconnect line
- [x] Tests: logFormat — newest-by-arrival across mixed log/activity sequences in both directions, plus the merge's stable keys and the defensive no-stamp ordering
- [x] ui-smoke: after a real reload/resume, tabB (which saw "Alice reconnected") flips its strip back to the game entry once the resumed seat plays again and the scene drains; no error banners
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Symptom (from to-discuss.md):** "ui: when a player has reconnected, the top strip always shows the reconnect stuff"

**Root cause (confirmed 2025):** `latestLogEntry` unconditionally preferred activity over the game log, and activity entries accumulate for the room's lifetime — so the strip only escaped via ticket 24's scene beat (a temporary override) and fell back to the reconnect line the moment the scene drained. The two sequences share no clock of their own, but every entry arrives through the same socket in order — the client-side arrival stamp is the truth for "newest".

**Implementation notes (ticket 31, 2025):** the `useGame` reducer stamps each folded log entry (one event folds at most one entry) and each `playerGone`/`playerBack` line with a monotonic `arrivalSeq`; `mergeLog` (logFormat.ts) orders the combined newest-first list and feeds both the strip and the expanded log, so the strip, the expanded top, and the live play all agree. `logArrivals` keyed by log entry id survives the room session; a page reload starts fresh (the replay re-stamps everything). Also surfaced while testing: a pre-existing ui-smoke harness race — two tabs can both click a stale `.round-over` "Start next round" button within the packet window, bouncing a transient `no_round_to_start` banner (a legal-play UI bounce a real room could hit too); noted for a possible follow-up.
