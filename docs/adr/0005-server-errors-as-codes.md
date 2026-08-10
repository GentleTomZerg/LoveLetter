# 0005 — Server errors travel as codes, not English text

Engine and protocol errors (`'room not found'`, `'not your turn'`, …) and room-closed reasons were sent to clients as English text (`error {message}`, `roomClosed {reason}`). With localization (ADR-0004), English over the wire cannot be translated.

Decision: the server sends error codes with optional params — `error {code, params}` and `roomClosed {code, params}`. The client maps codes through the locale dictionary; the engine's `err()` strings become code constants.

Consequences: a protocol change touching core (error constants), server (app.ts relay), and client (error mapping); the error banner and room-closed screen render localized text.

Status: accepted. Source: grilling session Q3 (2025).
