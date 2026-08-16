# 2 — Tracer bullet: a complete Guard-only match

**Legacy:** was #2 in the love-letter effort.

**What to build:** the thinnest end-to-end path that plays a full match: two people create/join a room, it auto-starts, a round deals out hands, someone plays a **Guard** naming a card and guessing a target, the guess resolves, the round ends, a token is awarded, and the match ends at the token target with rematch available. This is the vertical spine — every layer works (engine → server → client) with exactly one card, so later tickets deepen instead of rewire.

**Blocked by:** 1

**Status:** resolved

- [x] Engine (test-first): types, `phase` machine (lobby → round → roundEnded → matchEnded), deck build, setup per player count (burned face-down card; 2-player face-up removals), `apply(state, intent)` returning `{state, events[]}` and rejecting illegal intents
- [x] Guard effect: plays a card, requires a follow-up `choice` (target player + card name via `pendingChoice`), resolves match → eliminate (reveal hand) / miss → nothing; Guard cannot name Guard; Guard self-targeting disallowed (ruling 3)
- [x] Round end: last player standing, or highest hand at deck-empty (tie → higher total of discarded values); full tie → all tied players get a token (ruling 1)
- [x] Match end: token target 7 for 2 players; `rematch` intent starts a new match with same seats
- [x] Server: room registry (`Map<roomCode, Room>`), `createRoom`/`joinRoom` (auto-start when full), `playCard`/`choice` intents, `hello` + `event` stream, `error` messages, Node http serving the client build + WS upgrade
- [x] Client: Home (name + create/join), Lobby (seats, room code, auto-start), Game (hand, click-to-play Guard, guess picker, public log, scoreboard) — rendering state rebuilt from the event stream
- [x] Verified by hand in two browser tabs: full 2-player match with Guard-only plays ends correctly and rematch works

## Comments

**Implemented (2025):** full vertical spine per the checkboxes above. Notes:

- **Automated twin of the hand check:** `packages/server/scripts/smoke.ts` (`npm run smoke --workspace @love-letter/server`) boots the real server, drives two WebSocket clients through a complete 2-player match to the 7-token target, rematch, and the error paths — each client folds the event stream with the same core reducer the browser uses. Green.
- **One real bug caught by the smoke:** `reduceView` didn't increment tokens on `roundEnded`, so the client scoreboard would have stayed at 0 forever. Fixed with a regression assertion.
- **Join protocol:** the server sends `hello` → `snapshot` (private view incl. own hand) → events; a joiner's snapshot already reflects their own join/auto-start, so the join batch goes only to pre-existing sockets (no double-apply). Documented in DESIGN.md.
- **Edge ruled:** two players reaching the token target in the same round (possible via full-tie, ruling 1) → first in seat order wins the match. Recorded as ADR-0002.
- **Out of scope here (later tickets):** non-Guard cards are deliberate no-ops in the engine (ticket 3 deepens via the per-rank dispatch, not a rewire); disconnect grace/auto-fold, reconnect replay, and chat (love-letter-server/01); full random-play simulation scale-up (ticket 4); richer Game screen + all choice prompts (love-letter-client/01).
- **Remaining manual step:** the two-browser-tab check — `npm run dev`, open `http://localhost:5173` in two tabs, create/join a 2-player room, play a Guard-only match to 7 tokens, rematch. Left unchecked since it needs real tabs; the smoke covers the same path programmatically.

**Verified by hand (2025-08-09):** two-tab playthrough at `http://localhost:5173` — create/join auto-start, Guard-only match to 7 tokens with correct guess/elimination/round-end flow, scoreboard + public log rendering, rematch with same seats and reset tokens, and the error banner on an illegal play all behaved. Ticket complete.
