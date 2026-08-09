# 05 — Server: grace, reconnect, resume replay, chat

**What to build:** the server's resilience layer on top of the completed engine — players can drop and return without losing their seat, missed events replay from `lastEventId`, and friends can chat during the match.

**Blocked by:** 03

**Status:** resolved

- [x] Socket drop → 60s grace; if their turn comes and they're still gone, auto-fold out of the round (seat kept for next round)
- [x] `resume {playerId, lastEventId}` — reconnect replays missed events from the stored event log
- [x] Event log per room grows and is queryable by event id; players can't receive others' hidden information through replay (replay is per-player filtered by what they could legally know)
- [x] Chat relay: `chat {text}` → broadcast to room; simple free-text, appended to a chat log
- [x] Error messages for illegal intents surface to the client (`error` message), not silent drops
- [x] Two-tab verification: disconnect mid-round, reconnect, and the game state resumes correctly

## Comments

**Implemented:** engine `fold` intent + `choiceAbandoned` event; protocol extensions (`resume`/`chat`/`chatLog`, event ids, `snapshot.lastEventId`); server grace/auto-fold, resume replay, chat relay, room expiry, duplicate-socket replacement; smoke-test verification; minimal client resume + chat plumbing. 109 core tests + smoke green (smoke hammered 10× for stability), typecheck clean, client builds.

- **Grace/fold (Q12):** on socket close the seat is held for `graceMs` (default 60s, configurable for tests). When the turn owner's grace expires and they're still gone, the server applies the engine's new `fold` intent — hand revealed like any elimination, open `pendingChoice` abandoned (`choiceAbandoned`), turn passes on, seat kept for the next round. The engine refuses to fold the *last* in-round player (a round can't end with nobody); the server then schedules room expiry as a safety net (defensive — analysis shows the case is unreachable through normal play, since any elimination that leaves one in-round player ends the round immediately).
- **Resume/replay:** `resume {playerId, lastEventId}` rebinds the seat (kicking any stale duplicate socket), sends `hello` + `snapshot {view, lastEventId}` + every event after `lastEventId` from the authoritative log, privacy-filtered with the same rule as live broadcast — private card payloads never leak through replay. A client that kept its view folds the replay onto it; a fresh client uses the snapshot (the client always sends −1 on refresh, so the browser path is snapshot-based; the incremental path is exercised by the smoke's keep-view resume).
- **Chat (Q14):** `chat {text}` → broadcast to the room (echo included), kept on a bounded 200-line room log, resent as `chatLog` on resume. Client hook exposes it; the Game-screen chat UI is ticket 06.
- **Bugs found and fixed along the way (all pre-existing, exposed by replay):** (1) `startRound` emitted `cardDealt` *before* `roundStarted`, but the view reducer resets the hand on `roundStarted` — the room creator's view silently lost their dealt card all along; events are now announced round-first, `deckCount` semantics unchanged. (2) The view reducer never tracked `protected` (Handmaid badge never appeared) or `burnedCount` (burned card never displayed) from events; now folded from `cardPlayed`/`turnStarted`/`roundStarted`/empty-deck draws.
- **Review:** two-axis code review found no spec or standard blockers. Fixed from findings: bundled the `rooms`/`playerRooms`/`graceMs` trio into a `ServerContext` (Data Clumps), extracted `sendSnapshot`/`markSeatGone` (Duplicated Code), and closed the cross-seat resume leak (an abandoned seat now gets its own grace window).
