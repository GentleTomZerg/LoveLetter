# Love Letter — Server (rooms and resilience)

**Status:** active — 1/3 tickets resolved; 2 open (02 leave-room, 03 next-round-race)

**Type:** spec

**Effort:** love-letter-server

## Problem Statement

Friends play on a LAN from real browsers on real phones: sockets drop, tabs
refresh, people quit. The server is authoritative — it validates every intent
against the engine, holds the append-only event log, and must keep a player's
seat through an accidental drop while still letting an intentional leave
actually leave. A player who closes the tab mid-match must not ghost the table
forever.

## Solution

A Node server over WebSocket. Rooms are `Map<roomCode, Room>`; a room lives
from creation until close, lobby is a room's phase. The protocol: intents
(`createRoom` / `joinRoom` / `playCard` / `choice` / `rematch` / `resume
{playerId, lastEventId}` / `chat` / `leave`), and events are broadcast as
id'd, append-only records, privacy-filtered per viewer — private card payloads
are `card: null` live and in replay.

- **Grace and resume** — on socket close the seat is held for `graceMs`
  (60s); if the turn owner's grace expires the server applies the engine's
  `fold` intent (hand revealed, `choiceAbandoned`, turn passes). `resume`
  rebinds the seat (kicking stale duplicates) and replays missed events from
  `lastEventId` with the same privacy filter.
- **Chat relay** — free text broadcast to the room, bounded log, resent as
  `chatLog` on resume. Room-layer facts (chat, `playerGone`/`playerBack`)
  live outside the event log.
- **Errors as codes** — `error {code, params?}` and `roomClosed {code,
  params?}`; the client maps codes through its locale dictionary, never
  English text from the server (ADR-0005).
- **Room directory** — browsing sockets receive a live list of open rooms
  (lobby phase, free seat) on the five lobby-relevant transitions; the client
  half lives in `love-letter-entry`.

## Standing contracts

- **Wire carries codes, not text** (ADR-0005) — including `roomClosed`
  reasons like `player_left` / `no_show`.
- **Privacy filtering is per-viewer and survives replay** — replay must never
  leak hidden information.
- **Intent is told apart from accident** — `leave` unbinds the socket before
  close so no grace window starts; drop visibility comes from room-layer
  packets, not log events.

## Tickets

| # | Ticket | Legacy | Status |
|---|---|---|---|
| 01 | server-resilience | was 05 | resolved |
| 02 | leave-room | was 11 | ready-for-agent |
| 03 | next-round-race | was 32 | needs-triage |

## Remaining scope

- **02 — Leave room** (designed; decisions locked with the maintainer).
  An intentional leave (button + confirm, `leave` intent, identity cleared),
  drop *visibility* (`playerGone`/`playerBack` + away badge), a no-show rule
  (seat vacated at the next safe point — round end — after grace expires),
  and 2-player teardown (`roomClosed`, no new phase). Out of scope by
  decision: mid-match refill, automatic reconnect, host kick.
- **03 — Next-round race** (needs-triage). A legal-play race bounces a
  transient `no_round_to_start` banner; the fix is a client disable-on-click
  and/or a server-side idempotent `nextRound` (a repeated intent for the same
  round boundary is ignored, not errored).

## Testing strategy

The **server smoke** (`npm run smoke`) boots the real server and drives real
WebSocket clients through full matches: token targets, rematch, the error
paths, privacy (a peek never reaches non-peekers), and the leave/close paths.
Client-facing behavior is covered by ui-smoke (`love-letter-client`).
