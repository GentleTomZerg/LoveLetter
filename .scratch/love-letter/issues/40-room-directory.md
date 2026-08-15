# 40 — Room directory: browse open rooms from Home

**What to build:** a live directory of **open rooms** (a room in its lobby phase with a free seat — CONTEXT.md) on the Home screen, served over the existing WebSocket. Rows: room code, host name (first seated — display-only, no powers), seated players' names, `n/capacity`. Newest first. Clicking a row joins with the shared name. In-progress matches stay invisible (mid-match join is engine-illegal — ADR-0008). The code field remains the join-by-code fallback.

**Blocked by:** 41 (the directory's UI lives in the Join card that ticket 41 creates; protocol + server work can start independently, the list UI lands with the card).

**Status:** ready-for-agent

- [ ] Core (`protocol.ts`): `RoomSummary {code, host, names, seated, capacity}` + a `roomList` request (C→S) and response `{type:'roomList', rooms: RoomSummary[]}` (S→C)
- [ ] Server (`app.ts`): `handleRoomList` answers a browsing socket (no room bound) with the directory — every room in lobby phase with a free seat, newest first
- [ ] Server: push a fresh directory to browsing sockets on the **five lobby-relevant transitions only** — `createRoom`, `joinRoom`, `leave`, room deletion, lobby→round auto-start; never recompute on mid-round events
- [ ] Client (`useGame.ts` + `Home.tsx`): request the directory on Home mount (and on socket reopen); reducer stores it and folds pushes
- [ ] Client: the Join card renders the rows (code, host, names, n/capacity), newest first; row click joins with the shared name (name required — seat-taken races surface through the existing error banner, no new failure mode)
- [ ] Client: empty state — "No open tables — start one!" (ties to the Start card)
- [ ] i18n: directory keys (header, empty state, row labels) en + zh — zh completeness is a compile error (ADR-0004)
- [ ] Tests: ui-smoke — directory shows a room, clicking it joins (name filled), the room leaves the list when it fills/auto-starts; no new error paths; core + typecheck + smoke + ui-smoke green

## Comments

**Decision (grilling session — Q1/Q2/Q6/Q7, 2025):** rooms are discoverable by design on a LAN; the code remains the shareable handle and the directory complements it. Joinable-only rows (open lobbies), so the list never teaches a dead-end click. Liveness = request on mount + server push on the five transitions; the server already distinguishes browsing sockets (no room bound) from seated ones. Rows are rich (names are the social proof) and newest-first. In-progress matches are intentionally invisible until spectating/mid-match join exists (ADR-0008 consequences).
