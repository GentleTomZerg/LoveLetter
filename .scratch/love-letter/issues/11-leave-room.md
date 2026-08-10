# 11 — No way to leave a room; a closed tab keeps the seat forever

**What to build:** an intentional "leave" plus a visible no-show rule, so a player who quits actually leaves — closing the browser currently keeps the seat occupied (grace → auto-fold → seat kept next round), with no sign to the table that anyone is gone and no way to free a seat.

**Blocked by:** none

**Status:** ready-for-agent

## Symptom (reported from real play, iPhones)

"When user leave the browser, he doesn't logout, still there, not quit." Confirmed in code: there is no `leave` concept anywhere (`protocol.ts`, `useGame.ts`, `app.ts`). The only exits are an accidental-drop grace window (60s) and room expiry when the last socket leaves. A player who closes the tab mid-match is auto-folded when their turn comes, but their seat is kept for every subsequent round — a ghost that can never be filled.

Two further gaps surfaced during discussion:
- The drop is **invisible**: nothing is broadcast when a socket closes, so the remaining players see no sign a player is gone until their turn comes and the fold fires (up to a full round later). On the dropped side, the only hint is the client's "Connection lost — refresh to resume" screen.
- A no-show seat is kept **forever**: grace → fold → seat kept every round. In 2p this is a token farm — the remaining player beats an auto-folding ghost every round to the match target, with no way to end it early or free the seat.

## Design tension

DESIGN Q12 deliberately holds a dropped seat for `graceMs` so a refresh/reconnect is seamless. The missing pieces are the *intentional* exit and a *visible, bounded* consequence for no-shows. The fix must not break accidental-drop recovery.

## Decisions (locked with the maintainer, 2026-08-10)

### 1. Leave button — intent, irreversible, with confirm

- A "Leave game" button in the lobby and the game header, behind a confirm step.
- Client: send `leave`, clear the stored `playerId` from `sessionStorage` (so a refresh never resumes), navigate Home. Fire-and-forget — leaving is always legal, so the client doesn't wait for an ack.
- Server: unbind the socket **before** closing it (`conn.room = null`), so the close handler no-ops and **no grace window starts** — this is how intent is told apart from accident. Remove the seat via the new engine `leave` intent; drop the `playerRooms` entry.
- Irreversible: the old identity is dead. Rejoining later means a fresh identity — same room in the lobby, or elsewhere mid-match.

### 2. Drop visibility — room-layer packets, like chat, not log events

The engine doesn't know about sockets (chat set the precedent: room-layer facts live outside the event log). New broadcast packets + snapshot state:

- `playerGone { playerId }` on socket close → scoreboard shows an **away badge** ("reconnecting…"), log line "Alice disconnected — her seat is held".
- `playerBack { playerId }` on resume → badge clears, log line "Alice reconnected".
- The snapshot carries the away set, so a reconnecting player's fresh view still knows who's away.
- Grace expiry → the existing fold ("folded (disconnected)") keeps the round moving.
- Guard: only broadcast `playerGone` for a genuine drop (the close handler already checks the socket is still the seat's current one; `markSeatGone` calls from `handleResume` seat-abandonment should suppress the broadcast).

### 3. No-show rule — vacate at the next safe point (the ghost fix)

One rule: **once grace has expired and the owner still hasn't returned, the seat is vacated at the next safe point — the end of the current round (immediately if no round is in progress).** Implemented as a server-side sweep at round end that invokes the same engine `leave` intent as the button.

- 3–4p: seat vacated between rounds; the match continues with fewer players. **No mid-match refill** (deliberate: token-inheritance and fairness questions; a small engine change can add `roundEnded` joins later).
- 2p: the round completes, then the vacate leaves one player → match-over message + teardown (see below). At most one farm round, instead of seven.
- Resume before the sweep → seat kept; nothing lost. Q12 accident recovery is untouched.
- Token target stays fixed at the room's original capacity target (a 4p room reduced to 2p still plays to 4; 2p rules for face-up removals apply since `startRound` keys off `players.length`).

### 4. Two-player teardown — server-side, no new phase

A 2p room can't survive losing a seat, and a round can't end with nobody. The engine keeps its invariants; the *server* decides the room is unplayable: send a terminal packet (`roomClosed { reason }`, e.g. "Alice left the game — match over") to the remaining socket, then tear the room down. Triggered by the button (immediate) and by the no-show sweep (after the round completes). No `matchEnded` abuse, no new phase in the state machine.

## Probable implementation shape

- **Protocol**: C→S `leave`; S→C `playerGone` / `playerBack` / `roomClosed`; `snapshot` carries the away set.
- **Engine** (`engine.ts`): one new `leave` intent, valid in lobby / round / roundEnded:
  - lobby: remove from `players`.
  - round: reveal the hand (same as a fold), abandon a pending choice if theirs, advance the turn / end the round if one in-round player remains. Rejected only if the room would drop below 2 players mid-round (the server tears down instead).
  - roundEnded: remove from `players`.
- **Server** (`app.ts`): `leave` handler (unbind → apply → broadcast → cleanup); broadcast `playerGone`/`playerBack`; round-end sweep that `leave`s expired no-shows; 2p teardown (`roomClosed` + `deleteRoom`); away set stamped into snapshots.
- **Client** (`useGame.ts`, `App.tsx`, screens): Leave button + confirm; clear `sessionStorage` on leave; away badge on the scoreboard; log lines for disconnect/reconnect/leave; Home screen for `roomClosed`.

## Acceptance

- [ ] A player can voluntarily leave from the lobby and from mid-match (confirm step; identity cleared; refresh lands on Home, never resumes)
- [ ] Leaving frees the seat — a new player can join where a seat is free (lobby)
- [ ] 2p: leaving or no-showing ends the match for the remaining player with a clear message; the room is torn down
- [ ] A dropped player is visible to the table: away badge + log on drop, cleared on resume
- [ ] A no-show seat is vacated at the next safe point (round end) after grace expires; the match continues with fewer players in 3–4p
- [ ] Accidental-drop grace/resume still works for a browser refresh (Q12 unchanged)
- [ ] The remaining players' views update cleanly (no ghost seat, no dangling current-turn reference)

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
- The 2p no-show today is a **token farm**: the ghost is dealt back in each round (`startRound` resets `out`), folds again on its turn, and the remaining player farms tokens to the match target.

**Resolved by the 2026-08-10 decisions above.** Notes for the implementer: reveal the leaver's hand for log consistency (same as a fold); leaving is always legal (never rejected, so the client can go fire-and-forget); a stale tab's leftover `resume` after a leave correctly fails with "no seat found" and self-clears the stored identity. Out of scope (separate tickets): automatic reconnect instead of the manual "refresh to resume" step; mid-match seat refill at `roundEnded`; a host "kick" feature.
