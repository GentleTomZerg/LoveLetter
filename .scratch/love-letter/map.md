# Love Letter — Effort map

**Status:** active — 37 of 41 tickets resolved; 4 open (server/02, server/03, story/09, story/10)

**Type:** map

**Effort:** love-letter

## Destination

A server-authoritative multiplayer Love Letter (AEG 2012) that friends can
play end to end on a LAN: complete rules, resilient rooms, a playable table on
desktop and phone, per-player language, and a table that narrates its own
story. Each feature below is a holdable idea with its own spec; the tickets
are the detail.

## Notes

- **Domain vocabulary** and standing contracts live in CONTEXT.md and the
  ADRs (0001–0008) — read them before touching any feature.
- The engine is the single source of truth: `apply(state, intent) →
  {state, events[]}`; clients fold the event log through `reduceView`, so
  replay, reconnect, privacy, and the story all derive from one source.
- **Standing contracts** that no feature may violate: the log is a projection
  of events, one entry each (ADR-0003); resolutions always complete with an
  event; privacy is per-viewer and survives replay; the story is functional
  presentation and never interrupts (ADR-0007); `prefers-reduced-motion`
  disables all animation; no error banner through legal play; wire carries
  codes, not text (ADR-0005); zh completeness is a compile error (ADR-0004);
  deck composition is data; trademark safety (role titles only).
- **The four adopted rulings**: full tie → every tied player gets a token;
  Countess fires immediately after a King trade; Guard self-targeting
  disallowed; 2-player Prince empty-deck draw takes the burned card.

## Features

| Feature | Spec | Tickets | State |
|---|---|---|---|
| love-letter-engine | spec.md | 6 | done |
| love-letter-server | spec.md | 3 | active (2 open) |
| love-letter-client | spec.md | 12 | done |
| love-letter-i18n | spec.md | 3 | done |
| love-letter-story | spec.md | 10 | active (2 open) |
| love-letter-tabletop | spec.md | 5 | done |
| love-letter-entry | spec.md | 2 | done |
| love-letter-visual-redesign | spec.md | — | ready-for-agent (fresh) |

## Frontier

Grab in this order — each ticket is self-contained (its blocking edges are
declared in the file):

1. **love-letter-server/02 — leave-room** (ready-for-agent; decisions locked)
2. **love-letter-story/09 — round-end-waits-for-story** (ready-for-agent)
3. **love-letter-story/10 — draw-appearance-sync** (ready-for-agent; shares
   09's `useStory` seam shape, independent of it)
4. **love-letter-server/03 — next-round-race** (needs-triage: client
   disable-on-click vs server idempotent `nextRound` — decide, then build)

## Ticket map (original love-letter numbering → current home)

| Was | Now | | Was | Now | | Was | Now |
|---|---|---|---|---|---|---|---|
| 01 | engine/01 | | 15 | i18n/01 | | 29 | client/12 |
| 02 | engine/02 | | 16 | i18n/02 | | 30 | engine/06 |
| 03 | engine/03 | | 17 | i18n/03 | | 31 | story/08 |
| 04 | engine/04 | | 18 | client/09 | | 32 | server/03 |
| 05 | server/01 | | 19 | story/01 | | 33 | tabletop/01 |
| 06 | client/01 | | 20 | client/10 | | 34 | tabletop/02 |
| 07 | client/02 | | 21 | story/02 | | 35 | tabletop/03 |
| 08 | client/03 | | 22 | story/03 | | 36 | tabletop/04 |
| 09 | client/04 | | 23 | story/04 | | 37 | story/09 |
| 10 | client/05 | | 24 | story/05 | | 38 | story/10 |
| 11 | server/02 | | 25 | client/11 | | 39 | tabletop/05 |
| 12 | client/06 | | 26 | engine/05 | | 40 | entry/02 |
| 13 | client/07 | | 27 | story/06 | | 41 | entry/01 |
| 14 | client/08 | | 28 | story/07 | | | |

Every moved ticket carries a `**Legacy:** was #NN` stamp; the historical
playtest log is `to-discuss.md` next to this file.

## Reconstruction note

This effort grew past feature size without its own structure — 41 tickets
accumulated in one directory with no spec (the tickets outlived the reasoning
that produced them). On 2026-08-16 the effort was reconciled: the spec was
reconstructed from the tickets, CONTEXT.md, and the ADRs; the tickets were
split into the seven features above (renumbered per feature, edges and
references rewritten, legacy stamps added); tickets 23–31 and 35's stale
`ready-for-agent` statuses were flipped to `resolved`. The old monolithic
spec.md was dissolved into the per-feature specs.
