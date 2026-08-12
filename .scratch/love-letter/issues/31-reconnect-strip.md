# 31 — Reconnect lines permanently win the top strip

**What to build:** after any disconnect/reconnect, the top strip is stuck on the reconnect line ("Alice reconnected") and never returns to the game log. Root cause confirmed: `latestLogEntry` (logFormat.ts) returns the newest **activity** line whenever any exists — `activity.length > 0 ? activity[last] : log[last]` — and room activity (issue 11's `playerGone`/`playerBack` lines) never shrinks, so the strip prefers a stale reconnect line over every later game entry. The expanded log has the same ordering (activity entries sort above game entries). The strip should show the newest *arrived* line regardless of which sequence it belongs to; activity is only "newer" at the moment it arrives.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] The strip (and the expanded list's top) show the genuinely newest entry across both sequences — e.g. a client-side arrival order shared by game events and activity lines, so an activity line wins only until the next game event lands (and vice versa)
- [ ] Ticket 24's beat override still wins during scenes, unchanged
- [ ] A reconnect mid-game no longer freezes the strip; a fresh play replaces the reconnect line
- [ ] Tests: logFormat — newest-by-arrival across mixed log/activity sequences (activity older than a later log entry loses, and the reverse)
- [ ] ui-smoke: after a real reload/resume, one more move flips the strip back to the game entry; no error banners
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Symptom (from to-discuss.md):** "ui: when a player has reconnected, the top strip always shows the reconnect stuff"

**Root cause (confirmed 2025):** `latestLogEntry` unconditionally prefers activity over the game log, and activity entries accumulate for the room's lifetime. Today the strip only escapes via ticket 24's scene beat, which is a temporary override — the moment a scene drains, the reconnect line is back. The two sequences "share no clock" today (activity is client-generated from packets); the fix gives them a shared arrival order at the `useGame` reducer (the socket delivers both in order, so an arrival counter is faithful).
