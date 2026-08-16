# Love Letter — Entry (enter and find a table)

**Status:** done — 2/2 tickets resolved

**Type:** spec

**Effort:** love-letter-entry

## Problem Statement

Entering the game was one mixed form (name + create + join in a single
panel) and the Lobby was a bare waiting screen. Friends deserve an entry that
matches the table: a Home that maps host vs guest onto two obvious places, a
Lobby that reads as a half-set table, and a way to see what tables are open —
on a LAN, rooms are discoverable by design.

## Solution

- **Two-card Home** (ticket 01) — a shared, persisted name field; a **Start a
  table** card (players 2–4 + Create) and a **Join a table** card (an
  empty-directory slot, plus a collapsed "I have a code?" join-by-code
  field). An invite link (`?room=CODE`) prefills and highlights the Join card
  — it never auto-joins, and a stale link fails honestly on the existing
  error banner.
- **Shareable Lobby** (ticket 01) — a share row under the room code
  (copy-code + invite-link), and empty seats rendered as theme-matched
  card-back tiles with a "waiting…" label; the `.seats`/`.seat` hooks stay
  untouched.
- **Room directory** (ticket 02) — a live list of **open rooms** (lobby
  phase, free seat) on Home, pushed over the existing WebSocket on the five
  lobby-relevant transitions (create, join, leave, delete, auto-start);
  rows show code, host, seated names, `n/capacity`, newest first; clicking
  joins with the shared name. In-progress matches stay invisible (mid-match
  join is engine-illegal — ADR-0008). The server half (browsing sockets,
  `roomDirectory`, pushes) is documented in `love-letter-server`.

## Standing contracts

- **Rooms are discoverable on a LAN** (ADR-0008) — the directory lists
  joinable rooms only, so it never teaches a dead-end click; the code remains
  the shareable handle and the directory complements it.
- **Invite is an invitation, not a teleport** — prefill + one confirmatory
  tap; stale links land on the error banner, not a silent no-op.
- **Hostless is deliberate** — auto-start on fill (Q18); host kick and
  start-early stay out.

## Tickets

| # | Ticket | Legacy | Status |
|---|---|---|---|
| 01 | home-lobby-layout | was 41 | resolved |
| 02 | room-directory | was 40 | resolved |

## Testing strategy

ui-smoke `runEntryAndWaitingPass` (two cards, directory empty state, invite
prefill + `.invited` highlight, stale-code error, Start-card create, lobby
copy/invite feedback with the clipboard stubbed, card-back tiles, seat hooks
intact, name persisted) and `runRoomDirectory` (row via push and via
request-on-mount, click-to-join, auto-start removal). Guardrails: the zh-stub
i18n test (new `home.*`/`lobby.*` keys), typecheck, build.

## Out of Scope

Spectating and mid-match join (directory stays lobby-only, per ADR-0008),
host controls, lobby chat (deferred unless the wait is felt), and the visual
reskin (`love-letter-visual-redesign`).
