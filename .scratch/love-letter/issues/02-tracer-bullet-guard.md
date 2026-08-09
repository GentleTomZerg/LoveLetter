# 02 — Tracer bullet: a complete Guard-only match

**What to build:** the thinnest end-to-end path that plays a full match: two people create/join a room, it auto-starts, a round deals out hands, someone plays a **Guard** naming a card and guessing a target, the guess resolves, the round ends, a token is awarded, and the match ends at the token target with rematch available. This is the vertical spine — every layer works (engine → server → client) with exactly one card, so later tickets deepen instead of rewire.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Engine (test-first): types, `phase` machine (lobby → round → roundEnded → matchEnded), deck build, setup per player count (burned face-down card; 2-player face-up removals), `apply(state, intent)` returning `{state, events[]}` and rejecting illegal intents
- [ ] Guard effect: plays a card, requires a follow-up `choice` (target player + card name via `pendingChoice`), resolves match → eliminate (reveal hand) / miss → nothing; Guard cannot name Guard; Guard self-targeting disallowed (ruling 3)
- [ ] Round end: last player standing, or highest hand at deck-empty (tie → higher total of discarded values); full tie → all tied players get a token (ruling 1)
- [ ] Match end: token target 7 for 2 players; `rematch` intent starts a new match with same seats
- [ ] Server: room registry (`Map<roomCode, Room>`), `createRoom`/`joinRoom` (auto-start when full), `playCard`/`choice` intents, `hello` + `event` stream, `error` messages, Node http serving the client build + WS upgrade
- [ ] Client: Home (name + create/join), Lobby (seats, room code, auto-start), Game (hand, click-to-play Guard, guess picker, public log, scoreboard) — rendering state rebuilt from the event stream
- [ ] Verified by hand in two browser tabs: full 2-player match with Guard-only plays ends correctly and rematch works
