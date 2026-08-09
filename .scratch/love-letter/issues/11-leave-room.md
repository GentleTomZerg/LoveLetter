# 11 — No way to leave a room; a closed tab keeps the seat forever

**What to build:** an intentional "leave" so a player who quits actually leaves — closing the browser currently keeps the seat occupied (grace → auto-fold → seat kept next round), with no way to free it for a new player.

**Blocked by:** none

**Status:** needs-triage

## Symptom (reported from real play, iPhones)

"When user leave the browser, he doesn't logout, still there, not quit." Confirmed in code: there is no `leave` concept anywhere (`protocol.ts`, `useGame.ts`, `app.ts`). The only exits are an accidental-drop grace window (60s) and room expiry when the last socket leaves. A player who closes the tab mid-match is auto-folded when their turn comes, but their seat is kept for every subsequent round — a ghost that can never be filled.

## Design tension

DESIGN Q12 deliberately holds a dropped seat for `graceMs` so a refresh/reconnect is seamless. The missing piece is the *intentional* exit. The fix must not break accidental-drop recovery.

## What to decide (needs the maintainer's call)

What should "Leave game" do in each state?

- **Lobby:** remove the player from the seats so the room can refill — clearly yes.
- **Mid-round (2p):** if a player quits, should the round/match continue (fold + free the seat) or should the match just end for everyone?
- **Mid-round (3–4p):** same, plus what happens to their tokens/seat for later rounds — freed for a new player, or held?
- **Last player leaving:** existing room-expiry behaviour already covers this.

## Probable implementation shape

- New protocol packet C→S `leave`; server removes the seat (room-side) and applies an engine intent or direct state change (careful: the engine owns state; a new `leave` intent or reuse of `fold` semantics needs a decision).
- Client: a "Leave game" button (header, scoreboard, or chat sidebar), returning to Home; the stored playerId cleared so a refresh doesn't resume.
- Broadcast a `playerLeft`-style event so the table/log stay consistent.

## Acceptance

- [ ] A player can voluntarily leave from the lobby and from mid-match
- [ ] Leaving frees the seat (a new player can join where a seat is free)
- [ ] Accidental-drop grace/resume still works for a browser refresh
- [ ] The remaining players' views update cleanly (no ghost seat)
