# 5 — Card counts in the rules manual

**Legacy:** was #39 in the love-letter effort.

**What to build:** the manual's card section (`CardAbilityList` in Game.tsx, the ticket 2 second section) shows each card's name, rank, and effect — but not how many copies of it are in the deck. Add the per-card count so the manual answers "how many of each card are there?" (e.g. **Guard ×5**, **Princess ×1**). Deck composition is data in core (DESIGN Q2: "an extended deck is a config change"), so the counts render from that data, never from a hardcoded copy.

**Blocked by:** none — the manual modal itself landed in ticket 2; this extends it. (Touches the same `CardAbilityList`; the old Abilities `<details>` is long gone.)

**Status:** resolved

- [x] **core** (`packages/core/src/cards.ts`): export the count data — derive `export const CARD_COUNTS: Record<Rank, number>` from the existing (private) `DECK_COMPOSITION`, so there stays exactly one source of deck truth. `buildDeck()` is unchanged; the deck still builds the same 16 cards.
- [x] **client** (`packages/client/src/screens/Game.tsx` → `CardAbilityList`): render `{cardName(rank)} ×{count} ({rank}) — {cardEffect(rank)}` (e.g. `Guard ×5 (1) — Choose a player and name a card…`), importing `CARD_COUNTS` from `@love-letter/core` alongside the existing `CARD_INFO` import. No new i18n keys — counts are numerals + `×`, so en and zh render identically and ADR-0004 zh-completeness stays trivially satisfied (no placeholder-leak exposure).
- [x] **ui-smoke** (`packages/server/scripts/ui-smoke.ts`, `fixedStage` step 3b): after the existing "eight cards" assertion, add two checks — the first `.abilities-list li` (Guard) contains `×5`, the last (Princess) contains `×1`.
- [x] Verify: core + client tests, typecheck, server smoke, ui-smoke green.

**Deliberately unchanged (grilling decisions):** the quick-rules setup bullet stays "Setup: 16 cards, 1 removed face-down; with 2 players, 3 more are removed face-up." (the composition lives one section down; ticket 2's rule is "concise — a manual, not a rulebook"); card name/effect text, rank-keyed thumbs, and the rulings section are untouched. `cardName()` is *not* touched — it is reused in log entries and the hand, where a count would be wrong.

## Comments

**Decision (grilling session — Q1–Q5, 2025):** five settled points, all confirmed by the reporter.

1. **Deck counts** — the canonical 16-card original (AEG 2012), matching rules spec §1 and the engine: Guard×5, Priest×2, Baron×2, Handmaid×2, Prince×2, King×1, Countess×1, Princess×1. (The reporter's initial example said "Guard 4 cards" — that is wrong for this repo's deck: Guard is ×5. A different physical edition would be a deck-composition change, not a manual tweak.)
2. **Count source** — export from core data (`CARD_COUNTS` derived from `DECK_COMPOSITION`), not i18n keys and not a hardcoded copy in the component. Single source of truth per DESIGN Q2; an extended deck updates the manual automatically.
3. **Render style** — inline: `Guard ×5 (1) — effect`. Count directly after the name, before the rank; mirrors the rulebook's "Value | Card | Count" table; zero new CSS; reads the same in zh (`守卫 ×5 (1)`).
4. **Setup bullet** — left as-is (no composition enumeration).
5. **Verification** — ui-smoke asserts the Guard row shows `×5` and the Princess row shows `×1` (the client has no DOM test harness; ui-smoke's `fixedStage` 3b is the only suite that sees the rendered manual). No new unit tests needed: the counts flow from core data already covered by engine tests.

**Domain-modeling note:** no glossary change — CONTEXT.md's **Card** entry already documents the deck composition ("Guard×5, Priest×2…") and the code's `count` field matches that language. No ADR — this is easily reversible, unsurprising, and DESIGN Q2 already records the "deck composition is data" decision.

**Implemented:** `CARD_COUNTS` (core) is derived from `DECK_COMPOSITION` via `Object.fromEntries`, so `buildDeck()` and the manual share one source of deck truth; `CardAbilityList` renders `{name} ×{count} ({rank}) — {effect}` from it. Note: the ticket's "the existing `CARD_INFO` import" was inaccurate — `Game.tsx` has no `CARD_INFO` import (it lives in `i18n/cards.ts` / `logFormat.ts`); the separate `CARD_COUNTS` value import is the correct resolution. ui-smoke `fixedStage` 3b asserts the Guard row contains `×5` and the Princess row `×1`.

- **Verification:** typecheck clean across all three workspaces; core 154/154 + client 77/77; server smoke OK; ui-smoke OK (`CHROME_PATH=/usr/bin/google-chrome-stable` — the script's default Chrome path is a macOS one).
