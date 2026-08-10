#!/usr/bin/env bash
#
# lan-deny.sh — roll back lan-allow.sh: close Love Letter's dev ports in
# firewalld. Removes any rich rule that opens 5173/3001 (whatever source
# subnet it was scoped to) and the plain port openings if present.
#
# Usage:
#   sudo ./scripts/lan-deny.sh
#   ./scripts/lan-deny.sh                       # re-execs itself with sudo
#
# Idempotent — removing a rule that isn't there is a no-op, not an error.
set -euo pipefail

P_CLIENT=5173/tcp
P_SERVER=3001/tcp

if [[ $EUID -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

if ! systemctl is-active --quiet firewalld; then
  echo "error: firewalld is not running — nothing to undo" >&2
  exit 1
fi

for p in "$P_CLIENT" "$P_SERVER"; do
  if firewall-cmd --permanent --query-port="$p" >/dev/null 2>&1; then
    firewall-cmd --permanent --remove-port="$p" >/dev/null
    echo "closed: $p (any source)"
  fi
done

# Snapshot the rich rules, then remove any that open the Love Letter ports.
while IFS= read -r rule; do
  [[ -z "$rule" ]] && continue
  if [[ "$rule" == *'port port="5173"'* || "$rule" == *'port port="3001"'* ]]; then
    firewall-cmd --permanent --remove-rich-rule="$rule" >/dev/null
    echo "removed rich rule: $rule"
  fi
done < <(firewall-cmd --permanent --list-rich-rules)

firewall-cmd --reload >/dev/null
echo "done — ports 5173 and 3001 are no longer reachable from the LAN"
