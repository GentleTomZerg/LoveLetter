# 05 — Server: grace, reconnect, resume replay, chat

**What to build:** the server's resilience layer on top of the completed engine — players can drop and return without losing their seat, missed events replay from `lastEventId`, and friends can chat during the match.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Socket drop → 60s grace; if their turn comes and they're still gone, auto-fold out of the round (seat kept for next round)
- [ ] `resume {playerId, lastEventId}` — reconnect replays missed events from the stored event log
- [ ] Event log per room grows and is queryable by event id; players can't receive others' hidden information through replay (replay is per-player filtered by what they could legally know)
- [ ] Chat relay: `chat {text}` → broadcast to room; simple free-text, appended to a chat log
- [ ] Error messages for illegal intents surface to the client (`error` message), not silent drops
- [ ] Two-tab verification: disconnect mid-round, reconnect, and the game state resumes correctly
