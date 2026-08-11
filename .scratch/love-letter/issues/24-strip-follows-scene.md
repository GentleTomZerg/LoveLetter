# 24 — Strip follows the scene; the round waits

**What to build:** the top bar narrates in lockstep with the animation, and the round blocks while a scene plays. Today the strip shows the newest log entry the instant it exists, so the win line lands while the final scene is still playing and players can act over a resolution. Now: while the scene queue is non-empty, the top bar shows the entry of the **currently-animating beat** (falling back to the latest entry when idle or under reduced-motion), and the hand + choice buttons are disabled until the scene drains — chat stays live. The win line appears in the strip only when the win moment actually plays.

**Blocked by:** 23 — needs the scene queue to know the current beat.

**Status:** ready-for-agent

- [ ] Strip sync: while a scene plays, the top bar shows the beat's log entry — the strip never races ahead of the animation; idle/reduced-motion → the latest entry, exactly as today; the expanded log is unchanged
- [ ] Blocking: the hand and choice buttons are disabled while the scene queue is non-empty; chat stays live; the round-over panel stays usable
- [ ] ui-smoke: the strip shows the animating beat's line, and the win line appears only at the win moment; the hand is disabled during a scene and re-enabled after it drains; no error banners
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Decisions (grilling session 2025):** Q3 → the strip follows the scene (a) — this is what kills the "the win log just overrides the last card action" feeling. Q4 → blocking (a): a turn-based game's pause *is* the story; each client drains its own queue at its own pace, but events arrive to all clients at nearly the same moment, so players stay roughly in sync.
