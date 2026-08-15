# 41 — Entry + waiting-room layout: two-card Home, shareable Lobby

**What to build:** the Home screen stops being one mixed form and becomes two distinct cards under a shared name; the Lobby becomes a shareable, table-like waiting room. Presentation-only — no engine or protocol changes. The room directory (ticket 40) slots into the Join card's empty state; 41 lands first and leaves the slot ready.

**Blocked by:** none

**Status:** ready-for-agent

- [ ] Home: one shared name field at the top, **persisted** (new localStorage key beside the existing player-id key); the two cards stay enabled regardless of the name — it is only required at the moment of create/join
- [ ] Home: **Start a table** card — players (2–4) ▾ + Create
- [ ] Home: **Join a table** card — an empty-directory slot (renders ticket 40's list when it lands; empty state "No open tables — start one!"), plus a collapsed *"I have a code?"* field for join-by-code
- [ ] Invite link: a `?room=CODE` query on load prefills the code field and highlights the Join card — never auto-joins; a stale link (room gone) lands on the existing error banner
- [ ] Lobby: share row under the room-code heading — copy-code button (`navigator.clipboard`) + invite-link button (the full URL, `?room=CODE`); localized en + zh
- [ ] Lobby: empty seats render as **card-back tiles** (`back-light.png` / `back-deep.png` by theme) with a "waiting…" label; filled seats keep their name plates; the `.seats`/`.seat` DOM hooks stay untouched
- [ ] Smoke contract: update the Home-flow assertions in ui-smoke + `screenshots.ts` for the two-card DOM (the reskin's frozen-contract clause covers the *reskin only* — a layout pass updates the contract deliberately); keep the `.screen.lobby h1` + `.seats`/`.seat` assertions as-is
- [ ] i18n: card titles, "have a code?", directory/empty-state keys ×2 locales (ADR-0004)
- [ ] Tests: ui-smoke — create via Start card, join via code field, invite-link prefill + highlight, lobby copy/invite buttons; no regressions on the existing seat hooks; typecheck + smoke + ui-smoke green

## Comments

**Decision (grilling session — Q1/Q3/Q4/Q8/Q9/Q10, 2025):** the Home's ambiguity came from forcing a choice the user may not have (do I have a code?) inside one panel with one name field. Two cards map host vs guest onto two places; one shared persisted name matches the server's one-playerId identity model. The invite link is an invitation, not a teleport — prefill + one confirmatory tap, so stale links fail honestly. The waiting room reads as a half-set table (card-back seats reuse existing art) with a copy/invite share row. Host controls (kick/start-early) stay out — hostless is deliberate (Q18 auto-start); lobby chat is deferred unless the wait is felt.
