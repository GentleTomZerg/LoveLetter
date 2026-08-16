# 15 — i18n plumbing: structured log entries, typed dictionaries, locale

**What to build:** the localization foundation (ADRs 0003 + 0004) with **zero visible change** — every string the game renders moves from hardcoded English into a typed `en` dictionary, the log entries become structured `{kind, params}`, and the client gains locale detection + a manual toggle. `zh` is a stub (same strings as `en`) — real translations are ticket 17.

**Blocked by:** none — start immediately.

**Status:** resolved

- [x] Core: `LogEntry` becomes `{id, kind, params}` (no `text`); `reduceView` emits params — player **ids** (not names), card **ranks**, round numbers, reasons — instead of English template strings; the `info` grab-bag gets a `what` sub-key (`{what: 'roundStarted', roundNumber}`)
- [x] Core: `ViewState.roster: Record<playerId, name>` — populated by `buildView` and on `playerJoined`, never shrinks, so historical log lines resolve names even after a player leaves (the `playerLeft` row removal already breaks id lookup today)
- [x] Client: `src/i18n/messages.ts` — `en`/`zh` sentence dictionaries with `t(locale, key, params)` (`{name}` interpolation); `MessageKey = keyof typeof en` and `zh: Record<MessageKey, string>` so a missing zh key is a compile error
- [x] Client: `src/i18n/cards.ts` — localized card names + effects per locale (`en` sourced from core's `CARD_INFO`; `zh` stubs for now)
- [x] Client: `LocaleProvider` + `useLocale()` returning `{locale, setLocale, t, cardName, cardEffect}`; locale = localStorage `love-letter-locale` ?? `navigator.language` (zh → `zh`, else `en`)
- [x] Client: **all** existing strings routed through the dictionary with wording preserved exactly (ui-smoke asserts on DOM text like `'Rematch'`): Home, Lobby, Game (header, banners, choice prompts, round/match panels, abilities), App (connecting/closed/room-closed), the Log renderer (self-vs-other via `selfId` + `roster`), the chat panel, the leave confirm
- [x] Client: `useGame` activity lines (`X disconnected — seat held`, `X reconnected`) become params-based entries
- [x] Home: a small EN | 中文 toggle (persisted)
- [x] Tests: `view.test.ts` `.text` assertions → kind/params assertions; `smoke.ts` match-log check → params check; core suite + typecheck + smoke + ui-smoke all green

## Comments

**Design (grilling session 2025, Q3–Q9):** per-client locale means one room can mix languages with zero server involvement. Log params carry ids/ranks, never display strings, so the renderer resolves `You`/`yourself`/card names per locale. The English output must be byte-identical to today so the UI smoke tests pass unchanged.

**Implemented (2025):** all boxes green — typecheck clean, 136 core tests, smoke + ui-smoke OK.

- **Core:** `LogEntry {id, kind, params}` (no `text`); new kinds `guard`/`baron`/`prince`/`king`; `info` lines carry a `what` sub-key; `ViewState.roster` (id → name, never shrinks) resolves historical lines after a leave; English text fully removed from `reduceView` (the `CARD_INFO` import went with it).
- **Client:** `src/i18n/` — `messages.ts` (typed `en`/`zh`, `zh` is `Record<MessageKey, string>` so a missing key is a compile error), `cards.ts` (names/effects per locale, `en` sourced from core's `CARD_INFO`), `index.tsx` (`detectLocale`, `t`, `LocaleProvider`, `useLocale`), `logFormat.ts` (the single formatter for all log entries; feeds ticket 19's strip later). All screens render through `t()`/`cardName`/`cardEffect`; Home has the EN | 中文 toggle (persisted).
- **Zero-visible-change audit:** English output is byte-identical to before, except two hover tooltips reworded to avoid plurals per ADR-0004 ("Discarded: {n}", "Hand: {n}") and the new toggle. ui-smoke's DOM-text assertions (e.g. `'Rematch'`) pass unchanged.
- **Tests:** `view.test.ts` text assertions → kind/params (`toMatchObject`); `smoke.ts` match-log check → `params.winnerId`; roster asserted in `buildView` and after a leave.
- **Deliberate no (Q16):** entries stay one-per-event — no chain enrichment (see ADR-0003 note).
