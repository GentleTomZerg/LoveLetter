# 0004 — Client-side localization with typed dictionaries

The game must speak Simplified Chinese (zh-Hans) alongside English. Today every string is English: hardcoded in React components, in `reduceView` log templates, and as raw text from the server.

Decision: localization is a hand-rolled, typed dictionary plus a small `t(key, params)` with `{name}` interpolation — no i18n library. Locale is **per client**: each client renders in its own language, auto-detected from `navigator.language` with a manual toggle persisted in localStorage, so one room can mix languages freely (the server never sees the locale). No plural machinery — phrases are authored to avoid plural forms. zh-Hans ships first under a single `zh` key.

Considered: react-i18next — rejected; its plural/date/fallback machinery is overkill for two languages and it pulls a dependency against the project's zero-dependency ethos.

Status: accepted. Source: grilling session Q3, Q5–Q9 (2025).
