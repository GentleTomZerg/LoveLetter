# Love Letter — Engine (the rules engine)

**Status:** done — 6/6 tickets resolved

**Type:** spec

**Effort:** love-letter-engine

## Problem Statement

The rules are the foundation every other layer leans on: a wrong ruling
silently corrupts every match, and a dead-end (an illegal play the UI can't
avoid) frustrates a real table. The engine must be a pure, testable,
event-sourced core — the single source of truth the server validates against
and the client's view derives from — with the adopted rulings pinned as named
tests so nobody rediscovers them.

## Solution

A pure TypeScript engine with no I/O: `apply(state, intent) → {state,
events[]}` rejects illegal intents (never guesses at them) and returns an
immutable ordered event list. The phase machine is `lobby → round →
roundEnded → matchEnded`; a match is rounds until a player reaches the token
target (7 / 5 / 4 for 2 / 3 / 4 players). Deck composition is **data**
(`DECK_COMPOSITION`) — an extended deck is a config change, not per-card code.
Two-phase effects run through `pendingChoice` (Guard: target + card guess;
Priest/Baron/Prince/King: target). The **view reducer** (`reduceView`) folds
events into a `ViewState` per player, filtering private card payloads so a
peek/draw/received-hand never leaks to other viewers.

### The four adopted rulings (named tests)

1. A **full tie** at deck-empty awards a token to every tied player.
2. The **Countess** auto-discards immediately after a King trade.
3. **Guard self-targeting** is disallowed (Guard cannot name Guard).
4. The 2-player **Prince empty-deck draw** takes the single burned card.

Two players reaching the match target in the same round: first in seat order
wins (ADR-0002).

## Standing contracts

- **The log is a projection of events** — one event, one entry; entries are
  structured `{id, kind, params}` carrying ids/ranks, never display strings
  (ADR-0003).
- **Resolutions always complete with an event** — nothing resolves silently;
  Guard miss and Baron tie emit `guardMissed` / `baronTied` (ticket 05), and
  the view reducer's log is a complete transcript.
- **Privacy is per-viewer and survives replay** — private card payloads are
  `card: null` to everyone but the owner; replay filters with the same rule
  (tickets 02, 05).
- **View-sync invariant** — every player's view hand equals the engine hand
  after every fold, pinned by the seeded probe (ticket 06).

## Tickets

| # | Ticket | Legacy | Status |
|---|---|---|---|
| 01 | scaffold-monorepo | was 01 | resolved |
| 02 | tracer-bullet-guard | was 02 | resolved |
| 03 | engine-seven-cards | was 03 | resolved |
| 04 | random-play-simulation | was 04 | resolved |
| 05 | resolution-completion-events | was 26 | resolved |
| 06 | king-trade-hand-desync | was 30 | resolved |

## Testing strategy

- **Per-card suites** for all 8 ranks + the four rulings as named tests.
- **Random-play simulation** — 3000 seeded matches (2/3/4p), invariants after
  every apply (hands ≤ 2, deck conservation, exhaustive target lists, an
  illegal-intent probe).
- **View-sync probe** — seeded matches fold every event through every
  player's view; caught the King-trade desync (ticket 06).
- Guardrails: `tsc --noEmit`, the server smoke's privacy assertion.

## Out of Scope

Server concerns (rooms, resilience, leave — `love-letter-server`), client
presentation (love-letter-client/story/tabletop), localization
(love-letter-i18n), and any rule change beyond the four adopted rulings.
