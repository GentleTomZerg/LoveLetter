#!/usr/bin/env bash
#
# dev-stop.sh — stop the Love Letter dev servers together.
#
# Kills whatever is currently listening on the dev ports, whether it was
# started by `npm run dev` or orphaned when the terminal died:
#   3001  Node game server (tsx watch)
#   5173  Vite dev client
#
# This is the counterpart of `npm run dev`. Ctrl+C normally stops both, but
# `tsx watch` can leave an orphan holding port 3001 — this is the reliable
# way to free the ports again, and it doubles as the stop button for the
# LAN helper ports (scripts/lan-allow.sh).
#
# Idempotent — safe to re-run; a free port is left alone.
#
# Usage:
#   npm run stop            (or: bash scripts/dev-stop.sh)
#
# Requires: lsof (ships with macOS and most Linuxes).
set -euo pipefail

P_SERVER=3001
P_CLIENT=5173

stop_port() {
  local port=$1
  local pids
  pids=$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
  if [[ -z $pids ]]; then
    echo "port $port: nothing listening — already stopped"
    return
  fi

  echo "port $port: stopping pid $pids"
  # shellcheck disable=SC2086
  kill $pids

  # Give the process a moment to release the port, then verify.
  for _ in {1..20}; do
    if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "port $port: stopped"
      return
    fi
    sleep 0.1
  done

  echo "port $port: still listening after SIGTERM — force killing" >&2
  # shellcheck disable=SC2086
  kill -9 $pids || true
}

stop_port $P_SERVER
stop_port $P_CLIENT
