# 2 — Room directory: browse open rooms from Home

**Legacy:** was #40 in the love-letter effort.

**What to build:** a live directory of **open rooms** (a room in its lobby phase with a free seat — CONTEXT.md) on the Home screen, served over the existing WebSocket. Rows: room code, host name (first seated — display-only, no powers), seated players' names, `n/capacity`. Newest first. Clicking a row joins with the shared name. In-progress matches stay invisible (mid-match join is engine-illegal — ADR-0008). The code field remains the join-by-code fallback.

**Blocked by:** 1 (resolved — the Join card exists; this ticket's list fills it)

**Status:** resolved

- [x] Core (`protocol.ts`): `RoomSummary {code, host, names, seated, capacity}` + a `roomList` request (C→S) and response `{type:'roomList', rooms: RoomSummary[]}` (S→C)
- [x] Server (`app.ts`): `handleRoomList` answers a browsing socket (no room bound) with the directory — every room in lobby phase with a free seat, newest first
- [x] Server: push a fresh directory to browsing sockets on the **five lobby-relevant transitions only** — `createRoom`, `joinRoom`, `leave`, room deletion, lobby→round auto-start; never recompute on mid-round events
- [x] Client (`useGame.ts` + `Home.tsx`): request the directory on Home mount (and on socket reopen); reducer stores it and folds pushes
- [x] Client: the Join card renders the rows (code, host, names, n/capacity), newest first; row click joins with the shared name (name required — seat-taken races surface through the existing error banner, no new failure mode)
- [x] Client: empty state — "No open tables — start one!" (ties to the Start card)
- [x] i18n: directory keys (header, empty state, row labels) en + zh — zh completeness is a compile error (ADR-0004)
- [x] Tests: ui-smoke — directory shows a room, clicking it joins (name filled), the room leaves the list when it fills/auto-starts; no new error paths; core + typecheck + smoke + ui-smoke green

## Comments

**Decision (grilling session — Q1/Q2/Q6/Q7, 2025):** rooms are discoverable by design on a LAN; the code remains the shareable handle and the directory complements it. Joinable-only rows (open lobbies), so the list never teaches a dead-end click. Liveness = request on mount + server push on the five transitions; the server already distinguishes browsing sockets (no room bound) from seated ones. Rows are rich (names are the social proof) and newest-first. In-progress matches are intentionally invisible until spectating/mid-match join exists (ADR-0008 consequences).

**Implemented (2025):** `protocol.ts` gains `RoomSummary` and the `roomList` request/response pair. `app.ts` tracks **browsing sockets** (`ctx.browsers` — added on connect, removed on create/join/resume/close); `roomDirectory()` lists every lobby-with-a-free-seat newest-first (Map insertion order reversed); `pushDirectory()` sends it to browsers on exactly the five lobby-relevant transitions (create, join, leave, `deleteRoom` — covering expiry/close/last-leave, and the final join's auto-start). `useGame.ts` stores `rooms`, answers `roomList` packets, and requests on Home mount — the `left` action now reports `status: 'connecting'` so the request refires once the fresh socket opens. `Home.tsx` renders `.room-row` buttons (names · code · n/capacity) in the `.directory-slot` (empty state unchanged), disabled until a name is typed, joining via the shared name. i18n: no new keys needed — the header + empty state already landed in ticket 1; row content is data, not labels.

- **Verification:** typecheck ✓ · vitest 154/154 ✓ · server smoke OK — new `runRoomDirectory` (WS seam): request→empty, create push, join push with updated seats, seated sockets stop receiving pushes, auto-start removal, newest-first ✓ · ui-smoke OK — new `runRoomDirectory` (browser seam): row via push (tab already browsing) and via request-on-mount (late visitor), row content (host/code/seats), disabled-before-name, click-to-join, 2/3 live push, auto-start removal. Note: the smoke shares one Chrome profile, so the scenarios clear the persisted name (ticket 1) for the disabled-before-name check.
