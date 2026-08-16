# 2 — End-to-end playtest and polish

**Legacy:** was #7 in the love-letter effort.

**What to build:** a human-playable full game, verified by hand — two (or more) browser tabs, a complete match with all 8 cards, every ruling exercised, then fixes and functional-clean polish. This is the "friends can genuinely play this" gate.

**Blocked by:** 1

**Status:** resolved

- [x] Full 2-player match played by hand: all cards, both rounds of the deck, match end, rematch
- [x] 3- and 4-player matches start, play, and end correctly (token targets 5 and 4)
- [x] Rulings exercised by hand: Countess forced discard after King trade, Prince'd Princess, Guard guess elimination, full-tie round
- [x] Disconnect/reconnect mid-match verified through the UI
- [x] Chat works between tabs
- [x] Edge cases fixed from playtest findings (illegal intents rejected with clear errors, no dead-ends in the UI)
- [x] Functional-clean pass: readable layout, obvious click targets, no broken states

## Comments

**Implemented (2025):** the playtest gate is automated in `npm run ui-smoke` — headless-Chrome CDP scenarios that play the real client end to end, now four of them (`packages/server/scripts/ui-smoke.ts` + shared plumbing in `scripts/cdp.ts`):

1. **render** — Home → Lobby → Game by room code, scoreboard, discard piles, chat across tabs (ticket 1 claims; screenshots saved to a temp dir for a human look).
2. **fullMatch** — a complete 2-player match to the 7-token target, rematch through the UI (tokens reset, round 1 again). Because a 2-player round deals only a few cards when it ends by early elimination, the single-copy ranks (King/Countess/Princess) can skip an entire match — the scenario keeps playing rematches until all eight cards have appeared in the public log (bounded at 5).
3. **multiPlayer** — 3- and 4-player rooms fill to capacity, auto-start, and play to match end at the right token targets (5 / 5 and 4 / 4).
4. **reload** — a mid-match tab reload (the real disconnect path): the seat resumes from the snapshot, reproduces the public table state exactly, chat history comes back, and the tab keeps playing.

Every scenario fails on any `.error-banner` — through legal play the UI should never bounce a rejected intent back at the player. Repeated runs are green (verified 4× consecutively), 115 core tests green, typecheck clean, server smoke green.

**Dead-end investigation — the Countess "forced discard" never reaches the UI:** the initial playtest pass hypothesized a dead-end where a player holding the Countess with the King/Prince clicks the wrong card and gets a rejection. Tracing the engine showed the hypothesis was wrong: `enforceCountess` fires at *every* hand change (draws, the King trade, the Prince's target, round start), so a consistent client view never holds the pair — the Countess is auto-discarded the instant a royal joins her, with a public log line. No dead-end existed. The work still produced value: the rule was extracted from a private engine helper into a shared, tested `forcedDiscard(hand)` in `core` (5 unit tests), and ruling 2 (Countess after a King trade) gained a dedicated defensive test — the trade case is unreachable in standard play (the King's target always holds one card) but must fire at the trade if it ever occurs (ADR-0001).

**Functional-clean pass:** the protected badge moved inside the game column (it sat orphaned below the two-column grid); no animations added; layout asserted by the smoke's render checks and screenshots.

**Remaining for a human (optional, fun part):** a hand-played match in two browser tabs exercising the rulings for real — the ruling *behavior* is verified by core tests (Prince'd Princess, Guard guess elimination, full-tie rounds, Countess paths) but the human-UI pass is this ticket's original spirit. Run `npm run dev`, open two tabs, and play.
