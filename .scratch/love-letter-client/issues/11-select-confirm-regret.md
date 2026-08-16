# 11 — Select-confirm regret for hand plays

**Legacy:** was #25 in the love-letter effort.

**What to build:** clicking a hand card no longer plays it immediately. Clicking a card **selects** it (highlight + a "Play" button); clicking the other card switches the selection — that's the regret, freely changing your mind before the card leaves your hand; tapping Play sends the play. Pure client UX — the server stays authoritative, no engine or protocol changes. The forced Countess stays marked-not-clickable (no choice anyway), and the selection resets when the turn passes or a pending choice opens.

**Blocked by:** None.

**Status:** resolved

- [x] Select state on the hand: clicking a playable card selects it with a clear highlight and a "Play" affordance; clicking the other card switches the selection; Play sends exactly once
- [x] The selection resets when the turn changes or a pending choice opens; the forced Countess card remains unplayable
- [x] ui-smoke: select → switch → confirm sends exactly once, and no play is sent before confirm; no error banners
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Decision (grilling session 2025):** Q6 → select-confirm (a). Server-side undo after the play was rejected — the engine resolves instantly and reversing a resolved play through the event-sourced log would need compensating events (a big, risky change). Regret before the send is where it's cheap, and it mirrors how the Guard choice flow already works (re-pick the target before sending).

**Implementation notes (ticket 11, 2025):** the four micro-decisions settled in the design pass — (1) the Play affordance is a **fixed action bar under the hand**, appearing only while a card is selected and labeled with the card name ("Play Guard"); (2) clicking the already-selected card **deselects** (toggle) — full regret, you can back out without playing; (3) the Play button is the **only** confirm path — no double-tap, no Enter shortcut — zero accidental-play risk; (4) **no special forced-Countess handling**: the engine auto-discards her at every hand change (`enforceCountess` after draw/trade/round-start), so a forced discard never sits in the client's hand — "not clickable" is trivially true, and any defensive marking would be dead code.

The selection is local React state in `Game.tsx`, cleared on send and on every world change under it (`handKey`/`currentTurn`/`pendingChoice`/`phase` — a stale index would highlight the wrong card after a play or resume). The card keeps the `playable` class (selectable), gains `selected` (accent ring + lift), and the confirm is `button.play-confirm`. `ui-smoke`'s `playOneMove` now selects + confirms atomically (a selected-but-unconfirmed card would be deselected by the next hand click), and the new `selectConfirm` scenario drives select → switch → confirm and asserts the log gains exactly one play line, nothing is sent before the confirm, and there are no error banners.

**Status flipped to resolved (2026-08-16):** implementation and verification are recorded above; the tracker status lagged the commits (see `git log` for the ticket-25 commits).
