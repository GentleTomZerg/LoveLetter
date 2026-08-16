# 34 — Rules manual: rules + cards + rulings in one popup

**What to build:** the Abilities reference becomes a proper **manual popup**: a short "how to play" (turn structure, round/match end, tokens, protected, burned), the eight cards with effects (the current Abilities content), and the four adopted rulings (Q17) — the rules that affect play but appear on no card face. Localized en + zh (ADR-0004: zh completeness is a compile error). Opened from the merged top bar's 手册/Manual button (ticket 33); the old Abilities `<details>` panel is removed.

**Blocked by:** 33 (the manual button lives in the merged top bar; the overlay pattern comes from the stage rework). The modal + content work itself can proceed independently — the entry point is what lands with 33.

**Status:** resolved

- [x] Manual modal: a centered overlay (the same pattern as the log/chat modals) with three sections — ① quick rules, ② the eight cards (rank, name, effect — the current Abilities content, reusing `CARD_TEXT` where it overlaps), ③ the four adopted rulings
- [x] Quick rules content (concise — a manual, not a rulebook; source facts from `docs/love-letter-rules-spec.md` + CONTEXT.md): setup (16 cards, 1 removed face-down, 2p also removes 3 face-up) · turn flow (draw at turn start → play one) · the Countess auto-discard while holding King/Prince · protected (Handmaid) · round end (last standing, or highest hand at deck-empty) · tokens to win (7/5/4) · match (tokens) · the burned card
- [x] The four adopted rulings (Q17): Guard self-targeting is disallowed · a full tie awards a token to every tied player · the Countess discards immediately after a King trade · the 2-player Prince empty-deck draw takes the burned card
- [x] Localized en + zh via new i18n keys (ADR-0004); no `{token}` placeholder leaks (the existing interpolation test pattern)
- [x] Close on outside click / Esc / a close button (the ticket-29 pattern); near-fullscreen on phones
- [x] Entry point: 手册/Manual button in the merged top bar (lands with ticket 33); the old Abilities `<details>` panel (ticket 12) is deleted
- [x] Tests: i18n — the new manual keys render in en + zh with no placeholder leaks; ui-smoke — the manual opens from the top bar, shows the three sections, closes; no error banners
- [x] core + typecheck + smoke + ui-smoke green

## Comments

**Decision (grilling session — Q2, 2025):** one popup, three sections: quick rules + the eight cards + the four adopted rulings. The rulings are the manual's reason to exist: they directly change how you must play (Guard can't name yourself; the Countess fires right after a King trade; the 2p Prince empty-deck draw) but are invisible on every card face. The old Abilities panel (ticket 12) is superseded and removed.

**Implemented (2025):** `ManualModal` (Game.tsx) is now the three-section manual — ① seven quick-rule bullets, ② the eight cards via the shared `CardAbilityList` (rank-keyed thumbs, name, effect), ③ the four rulings with a `§` accent. 15 new `manual.*` keys in en + zh; the placeholder-leak test pattern covers them all. The old Abilities `<details>` and the `game.abilities` key are deleted; the modal reuses the log-modal patterns (overlay + close button + Esc + outside click, near-fullscreen on phones via `.manual-dialog`).

- **Verification:** core 151/151, client 55/55 (2 new manual tests), server smoke OK, ui-smoke OK — runFixedStage now asserts the manual opens from the top bar with three sections, ≥7 quick-rule bullets, all eight cards (rank-keyed thumbs), four rulings, and closes. A zh probe rendered all three sections in Simplified Chinese (heads-up: the dialog is scrollable at 1280×800 — the content is long by design).
