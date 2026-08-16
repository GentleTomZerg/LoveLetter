# Love Letter — i18n (localization)

**Status:** done — 3/3 tickets resolved

**Type:** spec

**Effort:** love-letter-i18n

## Problem Statement

A Chinese room showing English banners would look broken, and the wire must
never carry display text — the server cannot know which language to send. The
game needs per-client localization end to end: every rendered string routed
through a typed dictionary, log entries structured so each client renders them
in its own language, and server errors delivered as codes.

## Solution

Per-client locale — one room mixes languages with zero server involvement.
`LocaleProvider` + `useLocale()` expose `{locale, setLocale, t, cardName,
cardEffect}`; locale is `localStorage` → `navigator.language` (zh → `zh`,
else `en`), with an EN | 中文 toggle on Home.

- **Structured log entries** (ticket 01, ADR-0003) — `LogEntry {id, kind,
  params}` carries player **ids** (never names) and card **ranks**, so the
  renderer resolves `You`/`yourself`/card names per locale; `ViewState.roster`
  (id → name, never shrinks) keeps historical lines resolvable after a leave.
- **Typed dictionaries** (ticket 01) — `MessageKey = keyof typeof en` and
  `zh: Record<MessageKey, string>`, so a missing zh key is a **compile
  error** (ADR-0004). One `zh` key, Simplified; Traditional is a later
  second dictionary, not a fork.
- **Errors as codes** (ticket 02, ADR-0005) — engine `err('english')` strings
  became stable kebab codes; `error {code, params?}` / `roomClosed {code,
  params?}` map through `tCode` with a defensive fallback for a client older
  than its server.
- **zh-Hans content** (ticket 03) — card names (守卫/祭司/…), log templates
  incl. the list joiner (`和`/`、`), UI strings, and error texts. The manual
  (tabletop feature) later adds `manual.*` keys through the same seam.

## Standing contracts

- **zh completeness is a compile error** (ADR-0004) — a new key without a
  real translation fails the build; the zh-stub vitest test enforces it.
- **Wire carries codes, not text** (ADR-0005).
- **Card faces keep baked English text** (ADR-0006) — the art is not
  localized; CJK falls back to system fonts.

## Tickets

| # | Ticket | Legacy | Status |
|---|---|---|---|
| 01 | i18n-plumbing | was 15 | resolved |
| 02 | server-errors-as-codes | was 16 | resolved |
| 03 | zh-hans-content | was 17 | resolved |

## Testing strategy

- **zh-stub test** — new dictionary keys must have real translations.
- **ui-smoke locale round-trip** — en → 中文 → EN with the browser locale
  pinned via CDP; the render scenario asserts DOM text (`Rematch`, …).
- Guardrails: `tsc --noEmit` (missing zh key = compile error), client vitest.

## Out of Scope

Traditional Chinese (a second dictionary later), translating card art
(ADR-0006), server-side localization (the server speaks codes only).
