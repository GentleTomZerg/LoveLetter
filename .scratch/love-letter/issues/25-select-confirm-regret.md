# 25 — Select-confirm regret for hand plays

**What to build:** clicking a hand card no longer plays it immediately. Clicking a card **selects** it (highlight + a "Play" button); clicking the other card switches the selection — that's the regret, freely changing your mind before the card leaves your hand; tapping Play sends the play. Pure client UX — the server stays authoritative, no engine or protocol changes. The forced Countess stays marked-not-clickable (no choice anyway), and the selection resets when the turn passes or a pending choice opens.

**Blocked by:** None.

**Status:** ready-for-agent

- [ ] Select state on the hand: clicking a playable card selects it with a clear highlight and a "Play" affordance; clicking the other card switches the selection; Play sends exactly once
- [ ] The selection resets when the turn changes or a pending choice opens; the forced Countess card remains unplayable
- [ ] ui-smoke: select → switch → confirm sends exactly once, and no play is sent before confirm; no error banners
- [ ] core + typecheck + smoke + ui-smoke green

## Comments

**Decision (grilling session 2025):** Q6 → select-confirm (a). Server-side undo after the play was rejected — the engine resolves instantly and reversing a resolved play through the event-sourced log would need compensating events (a big, risky change). Regret before the send is where it's cheap, and it mirrors how the Guard choice flow already works (re-pick the target before sending).
