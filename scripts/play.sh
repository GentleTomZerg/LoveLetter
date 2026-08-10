#!/usr/bin/env bash
#
# play.sh — start Love Letter for a remote friend, in one command.
#
# Builds the client if it's stale, starts the Node server on :3001 (which
# serves the built client + the /ws game socket), and opens a free
# cloudflared "quick tunnel" so a friend anywhere can play over https.
#
#   https://<random>.trycloudflare.com
#
# Usage:
#   ./scripts/play.sh          (or: npm run play)
#
# Stop:
#   Ctrl+C — kills both the server and the tunnel (idempotent; also see
#   scripts/dev-stop.sh for stray listeners).
#
# Notes / caveats:
#   - Quick-tunnel URLs are random and change on every run; that's fine when
#     you text it to a friend at game time. Want a stable URL? `brew install
#     cloudflared` + a named tunnel (paid or via your own Cloudflare domain)
#     — out of scope here.
#   - Your machine must stay awake and on the network for the session.
#   - The free tunnel needs no account and no config. WebSockets work
#     because the client talks same-origin (`/ws`), like LAN play.
#   - Logs (for debugging): /tmp/loveletter-server.log, /tmp/loveletter-tunnel.log
#
# Requires: curl, cloudflared (`brew install cloudflared`), npm.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_SERVER="/tmp/loveletter-server.log"
LOG_TUNNEL="/tmp/loveletter-tunnel.log"
PORT=3001
URL=""

cd "$ROOT"

# --- Build the client if any source is newer than the last build -----------
DIST="packages/client/dist"
if [[ ! -f "$DIST/index.html" ]] || find packages/client/src -type f -newer "$DIST/index.html" | grep -q .; then
  echo "client is stale — building…"
  npm run build --workspace @love-letter/client
else
  echo "client is up to date"
fi

# --- Start the server (single process: serves client + /ws) -------------
echo "starting game server on port ${PORT}..."

# The dev server (npm run dev) also binds :3001 — refuse to fight it.
if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "error: port $PORT is already in use (a dev server?). Stop it with: npm run stop" >&2
  exit 1
fi

: >"$LOG_SERVER"
npm run start --workspace @love-letter/server >"$LOG_SERVER" 2>&1 &
SERVER_PID=$!

for _ in {1..60}; do
  if curl -fsS -o /dev/null "http://localhost:$PORT/"; then
    echo "server is up"
    break
  fi
  sleep 0.5
done
if ! curl -fsS -o /dev/null "http://localhost:$PORT/"; then
  echo "error: server did not come up on :$PORT — last log lines:" >&2
  tail -20 "$LOG_SERVER" >&2
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

# --- Open the tunnel ---------------------------------------------------------
echo "opening cloudflared tunnel (https → localhost:$PORT)…"
: >"$LOG_TUNNEL"
cloudflared tunnel --url "http://localhost:$PORT" >"$LOG_TUNNEL" 2>&1 &
TUNNEL_PID=$!

for _ in {1..90}; do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_TUNNEL" 2>/dev/null | head -1 || true)
  [[ -n "$URL" ]] && break
  sleep 1
done
if [[ -z "$URL" ]]; then
  echo "error: tunnel did not open — last log lines:" >&2
  tail -20 "$LOG_TUNNEL" >&2
  kill "$SERVER_PID" "$TUNNEL_PID" 2>/dev/null || true
  exit 1
fi

cleanup() {
  trap - INT TERM EXIT
  echo
  echo "stopping session…"
  kill "$SERVER_PID" "$TUNNEL_PID" 2>/dev/null || true
  for _ in {1..30}; do
    if ! kill -0 "$SERVER_PID" 2>/dev/null && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      break
    fi
    sleep 0.2
  done
  kill -9 "$SERVER_PID" "$TUNNEL_PID" 2>/dev/null || true
  echo "done — server and tunnel stopped (port $PORT free)"
}
trap cleanup INT TERM EXIT

# --- Go -----------------------------------------------------------------------
echo
echo "🎮  Love Letter is live!"
echo "    Send your friend:  $URL"
echo "    (open it yourself to sanity-check before sharing)"
echo "    Room codes work across the tunnel — everyone joins the same room."
echo "    Press Ctrl+C here to stop the session."
echo
wait "$SERVER_PID" "$TUNNEL_PID" 2>/dev/null || true
# If the server died on its own, surface why before the tunnel cleanup.
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "server exited unexpectedly — last log lines:" >&2
  tail -20 "$LOG_SERVER" >&2
fi
