# 41 — Entry + waiting-room layout: two-card Home, shareable Lobby

**What to build:** the Home screen stops being one mixed form and becomes two distinct cards under a shared name; the Lobby becomes a shareable, table-like waiting room. Presentation-only — no engine or protocol changes. The room directory (ticket 40) slots into the Join card's empty state; 41 lands first and leaves the slot ready.

**Blocked by:** none

**Status:** resolved

- [x] Home: one shared name field at the top, **persisted** (new localStorage key beside the existing player-id key); the two cards stay enabled regardless of the name — it is only required at the moment of create/join
- [x] Home: **Start a table** card — players (2–4) ▾ + Create
- [x] Home: **Join a table** card — an empty-directory slot (renders ticket 40's list when it lands; empty state "No open tables — start one!"), plus a collapsed *"I have a code?"* field for join-by-code
- [x] Invite link: a `?room=CODE` query on load prefills the code field and highlights the Join card — never auto-joins; a stale link (room gone) lands on the existing error banner
- [x] Lobby: share row under the room-code heading — copy-code button (`navigator.clipboard`) + invite-link button (the full URL, `?room=CODE`); localized en + zh
- [x] Lobby: empty seats render as **card-back tiles** (`back-light.png` / `back-deep.png` by theme) with a "waiting…" label; filled seats keep their name plates; the `.seats`/`.seat` DOM hooks stay untouched
- [x] Smoke contract: update the Home-flow assertions in ui-smoke + `screenshots.ts` for the two-card DOM (the reskin's frozen-contract clause covers the *reskin only* — a layout pass updates the contract deliberately); keep the `.screen.lobby h1` + `.seats`/`.seat` assertions as-is
- [x] i18n: card titles, "have a code?", directory/empty-state keys ×2 locales (ADR-0004)
- [x] Tests: ui-smoke — create via Start card, join via code field, invite-link prefill + highlight, lobby copy/invite buttons; no regressions on the existing seat hooks; typecheck + smoke + ui-smoke green

## Comments

**Decision (grilling session — Q1/Q3/Q4/Q8/Q9/Q10, 2025):** the Home's ambiguity came from forcing a choice the user may not have (do I have a code?) inside one panel with one name field. Two cards map host vs guest onto two places; one shared persisted name matches the server's one-playerId identity model. The invite link is an invitation, not a teleport — prefill + one confirmatory tap, so stale links fail honestly. The waiting room reads as a half-set table (card-back seats reuse existing art) with a copy/invite share row. Host controls (kick/start-early) stay out — hostless is deliberate (Q18 auto-start); lobby chat is deferred unless the wait is felt.

**Implemented (2025):** `Home.tsx` is now the shared persisted name field + two `.panel.card` blocks. The Start card keeps the `.home select` + Create; the Join card holds the `.directory-slot` empty state (`.slot-header`/`.slot-empty` — ticket 40 fills it), the collapsed `.code-toggle`, and the `.code-input` row. `?room=CODE` is parsed once on mount (`invite.ts` `inviteCodeFromUrl`), prefills and expands the code field, and classes the card `.invited`; joining a stale code falls through to the existing `room_not_found` banner. `Lobby.tsx` gained the `.share-row` (copy code / copy invite link — `invite.ts` `inviteUrl`; `copyText` falls back to textarea+execCommand for LAN `http`, where `navigator.clipboard` is absent; the label flips to "Copied!" for 2s) and empty seats render as theme-matched `.seat-back` card tiles; `.seats`/`.seat` hooks unchanged. 10 new `home.*`/`lobby.*` keys in en + zh (the dead `home.or` divider key removed).

- **Verification:** typecheck ✓ · client vitest 77/77 (i18n zh-stub enforces the new keys) · full battery 154/154 · server smoke OK · ui-smoke OK — new `runEntryAndWaitingPass`: two cards, directory empty state, code collapsed by default, `?room=` prefill + `.invited` highlight + no auto-join, stale code → error banner, Start-card create, lobby copy-code/invite feedback (execCommand stubbed — the seam is the flow, not Chrome's clipboard), card-back tiles, seat hooks intact, name persisted; `runNarrowViewport` now expands the code path so Join is in the clipping check; `openRoom` and screenshots.ts join via the toggle. Pre-existing screenshots.ts bug fixed on the way: it asserted a fresh visitor defaults to *light* — host-OS-bound; the script now pins `prefers-color-scheme: light` via a new `setColorScheme` CDP helper (cdp.ts).
