# 3 — "Start next round" double-click race: a transient error banner

**Legacy:** was #32 in the love-letter effort.

**What to build:** two players can both click the round-over "Start next round" button within the same packet window — the first `nextRound` wins and starts the round, the second is rejected with `no_round_to_start`, bouncing a transient error banner at the loser. Real rooms hit this when two people mash the button at the same time; it also intermittently flakes the ui-smoke harness (a stale `.round-over` button click). Either the button disables itself immediately on click (per-client), or the server treats a duplicate `nextRound` for the same round as a no-op instead of an error.

**Blocked by:** none

**Status:** needs-triage

- [ ] Reproduce / decide the fix: client-side disable-on-click (button disabled until the round starts) vs server-side idempotent `nextRound` (a repeated intent for the same round boundary is ignored, not errored) — or both
- [ ] No error banner for a legal-play race; the round starts exactly once
- [ ] Tests: engine (if the server-side option) — duplicate nextRound is a no-op; ui-smoke — mash the button on both tabs and assert no error banner and exactly one round start
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Found while testing love-letter-story/08 (2025):** the ui-smoke harness intermittently failed with a real error banner — `no_round_to_start` — from `playOneMove` clicking a stale `.round-over button` on a tab whose view lagged one packet behind. That is the same race a real room hits when two players click "Start next round" near-simultaneously. The banner auto-clears on the next successful packet, so it is cosmetic — but it is a legal-play UI bounce, and the harness's own "no error banners through legal play" contract flags it.
