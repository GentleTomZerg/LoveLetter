# 11 — No way to leave a room; a closed tab keeps the seat forever

**What to build:** an intentional "leave" so a player who quits actually leaves — closing the browser currently keeps the seat occupied (grace → auto-fold → seat kept next round), with no way to free it for a new player.

**Blocked by:** none

**Status:** needs-info

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

## Comments

**Open for discussion (2025).** The user confirmed the rejoin half of the problem too: "I suppose I can join back, but I never actually logout." The decision needs the maintainer's call — this comment traces the current model and lays out the design space.

### How it behaves today (traced in code)

1. **Identity** — a server-issued `playerId` is kept in `sessionStorage` (per tab). Every page load sends `resume {playerId}` (`useGame.ts`), so the client never expresses "I'm done" — only "bring me back".
2. **Reopen while the room lives** — `resume` rebinds the seat (grace + replay); the player lands back in the game. This is the "I can join back" part, and it works.
3. **The room dies only 60s after the last socket leaves** (`app.ts` expiry). While other players keep playing, a quitter's stored id keeps dragging them back into the old room forever — the "I never actually logout" part.
4. **New tab = fresh identity** (`sessionStorage` is per-tab) — today's only escape hatch, and a silent, confusing one.

### The core tension

`resume` is a safety net for **accidents** (refresh, network blip). Leave is an **intent**. The system currently cannot tell them apart — hence one mechanism serves both badly.

### Roster facts that constrain any design (engine)

- `joinRoom` is **lobby-phase only** (`engine.ts:127`); once a match starts, seats are locked until `matchEnded`, and `rematch` keeps the same seats. So "leave so a friend can take over your seat" is impossible today — a seat freed mid-match cannot be filled by anyone without an engine change (e.g. allow joining during `roundEnded`, before `nextRound`).
- The engine **refuses to fold the last in-round player** (a round can't end with nobody) — in 2-player, a leaver cannot be folded mid-round; something else must happen (match ends for the rest, or the room closes).

### Proposed v1 (for reaction)

- A **"Leave game" button** (lobby + game header), with a confirm step.
- **Lobby:** removes the seat; room refills (works with today's engine).
- **Mid-round 3–4p:** folds them out of the current round (hand revealed, same as a grace-fold), seat freed at round end, and the engine allows a new player to **join during `roundEnded`** (before `nextRound`) when a seat is free.
- **Mid-round 2p:** the match ends for the remaining player with a clear message ("Alice left the game") — they can start a new room.
- **Identity:** leave clears `sessionStorage` → the tab lands on Home, fresh.
- **Accidents unchanged:** 60s grace + resume stays exactly as is.

### Open questions

1. Seat-refill between rounds (the `roundEnded` join): worth the engine change, or should a leaver's seat just stay empty for the rest of the match?
2. 2-player leave: end the match, or close the room entirely?
3. Rejoin: should leave be irreversible (identity cleared immediately), or keep the seat holdable until round end so they can change their mind?
