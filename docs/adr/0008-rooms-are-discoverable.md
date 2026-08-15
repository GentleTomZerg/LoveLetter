# 0008 — Open rooms are discoverable via a directory

The game was designed around join-by-code (DESIGN Q18): a room is private until its 4-letter code is shared out-of-band. That works when the host actively invites, but a player opening the app cold has no way to see what is happening. We add a room directory: the Home screen lists every **open room** on this server (a room in its lobby phase with a free seat), served live over the existing WebSocket, and clicking a row joins with your name. The code remains the shareable handle — the directory complements it, it does not replace it. Rooms are deliberately discoverable *on a LAN*; a future public deployment (DESIGN Q20) must revisit this model before enabling the directory there.

## Considered Options

- **Codes only (status quo)** — simplest, but a cold-open player sees nothing and cannot tell whether anyone is playing.
- **Directory + config flag to disable** — adds a knob nobody on a LAN needs; deferred until public hosting (Q20) actually exists, when privacy is a real requirement with real answers.

## Consequences

- The directory shows **open lobbies only**. In-progress matches are invisible (mid-match join is illegal in the engine by design), so the directory answers "can I hop into a table that is forming?", not "who is playing right now?". Spectating or mid-match join would revisit this.
- A room that fills and auto-starts, closes, or loses a lobby seat leaves the directory immediately — the list is only ever joinable rows.
