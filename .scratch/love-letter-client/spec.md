# Love Letter — Client (the playable table)

**Status:** done — 12/12 tickets resolved

**Type:** spec

**Effort:** love-letter-client

## Problem Statement

The game is only real when it is playable from a browser — every card's
choice prompt works, the table state is fully visible (discards, protection,
scoreboard), chat works, and it holds up on the phones friends actually use.
The baseline is **functional-clean**: readable, obvious click targets, no
broken states, no animations. (The later narration and layout waves — scenes,
the fixed stage, the dock — live in `love-letter-story` and
`love-letter-tabletop`; this feature is the playable core they build on.)

## Solution

A React + Vite client that renders **purely from the event stream**: a
`reduceView` reducer folds events into a `ViewState`, rebuilt from the
snapshot + replay on reconnect. Home → Lobby → Game for 2–4 players; room-code
join; every choice prompt renders from `pendingChoice` (target picker, Guard
guess); click-to-play with select-confirm regret (ticket 11); discard piles in
play order; public hand counts (ticket 07); a unified table panel (ticket 08);
a chat dialog with unread badge and a visible close (tickets 10, 12); card
art as rank-keyed PNGs with a card back and logo (ticket 03). Phone fixes:
iOS text-replacement opt-out (ticket 04) and the join-button clipping fix
(ticket 05).

## Standing contracts

- **No error banner through legal play** — the ui-smoke contract; a race that
  bounces a rejected intent at a legal player is a bug (tickets 02, 12).
- **Nothing is hover-only** — every card's effect is readable on touch
  (ticket 06).
- **Hand size is public; cards are private** — counts go to everyone, faces
  only to owners (ticket 07).
- **Functional-clean baseline** — readable layout, obvious targets, no broken
  states; animations arrive later via the story feature.

## Tickets

| # | Ticket | Legacy | Status |
|---|---|---|---|
| 01 | client-game-screen | was 06 | resolved |
| 02 | e2e-playtest | was 07 | resolved |
| 03 | art-integration | was 08 | resolved |
| 04 | ios-input-autotype | was 09 | resolved |
| 05 | join-button-clipped | was 10 | resolved |
| 06 | card-abilities-touch | was 12 | resolved |
| 07 | discards-shadow-handcount | was 13 | resolved |
| 08 | unified-table-panel | was 14 | resolved |
| 09 | rank-badge-top-right | was 18 | resolved |
| 10 | chat-pill-dialog | was 20 | resolved |
| 11 | select-confirm-regret | was 25 | resolved |
| 12 | chat-dialog-close | was 29 | resolved |

## Testing strategy

The **ui-smoke** suite (ticket 02) — headless Chrome over a real server plays
the real client: render, fullMatch (2p to the 7-token target + rematch),
multiPlayer (3p/4p targets), reload/resume, plus one scenario per feature
across the effort. Every scenario fails on any `.error-banner`. Guardrails:
typecheck, client vitest (i18n zh-stub), `vite build`.

## Out of Scope

Animations and the narration layer (`love-letter-story`), the fixed-stage
layout rework (`love-letter-tabletop`), localization (`love-letter-i18n`),
the Home/directory entry screens (`love-letter-entry`), and the server
(love-letter-server).

## Art release note

The integrated art is **LAN-only**: rank-2 artwork reads as a Spy while the
game displays "Priest", and the set's license is unconfirmed. Any public
release is blocked until `client/public/cards/2.png` is regenerated and the
license is confirmed or the art replaced (ticket 03).
