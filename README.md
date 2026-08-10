# Love Letter Online

Server-authoritative multiplayer [Love Letter](https://en.wikipedia.org/wiki/Love_Letter_(card_game)) (original 16-card edition) in TypeScript — a Node `ws` game server + a thin React/Vite client. Playable on a LAN or over the internet via a free tunnel. See `CONTEXT.md` (domain glossary) and `DESIGN.md` (locked decisions).

## Play with a remote friend (one command)

```bash
npm run play          # or ./scripts/play.sh
```

This builds the client if stale, starts the game server on `:3001`, opens a free
[cloudflared quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)
and prints a URL — text it to your friend, then press `Ctrl+C` to stop.

- Free, no account, WebSockets work out of the box (client talks same-origin `/ws`).
- The URL changes each session, so run it at game time (requires `brew install cloudflared`).
- Logs: `/tmp/loveletter-server.log`, `/tmp/loveletter-tunnel.log`.

## LAN play

```bash
npm run dev                       # Vite client (:5173) + game server (:3001)
sudo ./scripts/lan-allow.sh       # open ports 5173/3001 to the LAN subnet
# friends open http://<this-machine-ip>:5173 — roll back with lan-deny.sh
```

## Development

```bash
npm run dev         # both workspaces (client + server, hot reload)
npm test            # Vitest on the engine (core)
npm run typecheck   # tsc --noEmit across workspaces
npm run stop        # kill anything still holding :3001/:5173
```

## Layout

| Package | What |
|---|---|
| `packages/core` | Pure-TS game engine: rules, intents, events, views. Zero deps. |
| `packages/server` | Node `http` + `ws`: rooms, event log, grace/reconnect, chat. Serves the client build. |
| `packages/client` | React + Vite: Home → Lobby → Game, renders from the event stream. |
