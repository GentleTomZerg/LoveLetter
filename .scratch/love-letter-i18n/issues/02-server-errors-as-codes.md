# 2 — Server errors as codes over the wire

**Legacy:** was #16 in the love-letter effort.

**What to build:** stop sending English error text from the server (ADR-0005). Engine errors, protocol errors, and room-closed reasons become codes with optional params; the client maps them through the locale dictionary.

**Blocked by:** 1

**Status:** resolved

- [x] Core: the engine's `err('…')` strings become stable code constants (`room_not_found`, `not_your_turn`, `countess_forced`, …) — the message the client shows must never come from `core`
- [x] Server: `sendError(socket, …)` and `closeRoom(…, reason)` send `error {code, params?}` and `roomClosed {code, params?}` (e.g. `roomClosed {code: 'player_left', params: {name}}`)
- [x] Client: the error banner and room-closed screen render `t('error.<code>', params)`; unknown codes fall back to a generic string (defensive — the client can be older than the server)
- [x] `useGame` error handling keys off codes, not messages
- [x] smoke test: error-path assertions check codes; core + typecheck + smoke + ui-smoke green

## Comments

**Design (grilling session 2025, Q3):** full i18n scope includes errors — a Chinese room showing English error banners would look broken. Codes over text is the protocol change that makes it possible.

**Implemented (2025):** all boxes green — typecheck clean, 136 core tests, smoke + ui-smoke OK.

- **Core:** all 27 engine `err('english')` strings → stable kebab codes (`not_your_turn`, `countess_forced`, `fold_last_player`, …); `WireParams` exported; protocol `error {code, params?}` / `roomClosed {code, params?}`.
- **Server:** `sendError(ws, code, params?)` and `closeRoom(ctx, room, code, params?)`; app-layer strings → codes (`already_in_room`, `room_not_found`, `no_seat_found`, …); `unknown_packet` carries `{type}`; roomClosed codes `player_left` / `no_show` carry `{name}`. `params` omitted when absent (`exactOptionalPropertyTypes`).
- **Client:** `useGame` stores `{code, params}` (new `WireError` shape); App + Home render via the new `tCode(code, params)` — wire codes map to `error.<code>` dictionary keys with a defensive `error.unknown` fallback (an older client against a newer server can't crash `t()`: it now falls back to English, then the key). All 40+ error strings live in the en dictionary; zh stubs until ticket 3.
- **Tests:** deck/fold/leave error-text regexes → exact code equality; smoke error-path and roomClosed assertions → `err.code` / `closed.code` equality.
