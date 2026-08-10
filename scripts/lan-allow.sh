#!/usr/bin/env bash
#
# lan-allow.sh — open Love Letter's dev ports in firewalld so machines on the
# local network can reach this host (LAN play, DESIGN Q5).
#
# Opens, scoped to the LAN subnet only:
#   5173/tcp  Vite dev client (serves the UI, proxies /ws to the game server)
#   3001/tcp  Node game server (WS + HTTP API)
#
# The subnet is auto-detected from the interface carrying the default route
# (e.g. 10.213.82.0/24), or you can pass one explicitly. Nothing is opened
# for sources outside that subnet.
#
# Idempotent — safe to re-run; an existing rule is left alone.
#
# Usage:
#   sudo ./scripts/lan-allow.sh                 # LAN subnet auto-detected
#   sudo ./scripts/lan-allow.sh 192.168.1.0/24  # explicit subnet
#   ./scripts/lan-allow.sh ...                  # re-execs itself with sudo
#
# Rollback: scripts/lan-deny.sh
# Requires: firewalld running (`systemctl enable --now firewalld`).
set -euo pipefail

P_CLIENT=5173/tcp
P_SERVER=3001/tcp

usage() {
  sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# Re-run as root so every firewall-cmd below can talk to firewalld.
if [[ $EUID -ne 0 ]]; then
  exec sudo bash "$0" "$@"
fi

if ! systemctl is-active --quiet firewalld; then
  echo "error: firewalld is not running — start it with: systemctl enable --now firewalld" >&2
  exit 1
fi

# The address/prefix of the interface carrying the default route,
# e.g. 10.213.82.133/24. Prefers a real NIC over a TUN (mihomo's Meta).
detect_lan_cidr() {
  local devs dev
  mapfile -t devs < <(ip -o -4 route show to default | awk '{print $5}')
  if [[ ${#devs[@]} -eq 0 ]]; then
    echo "error: no default IPv4 route to detect a LAN subnet" >&2
    return 1
  fi
  for dev in "${devs[@]}"; do
    # A real NIC has a device symlink; TUNs like mihomo's "Meta" don't.
    if [[ -e "/sys/class/net/$dev/device" ]]; then
      ip -o -4 addr show dev "$dev" scope global | awk '{print $4; exit}'
      return 0
    fi
  done
  ip -o -4 addr show dev "${devs[0]}" scope global | awk '{print $4; exit}'
}

# Turn an address/prefix like 10.213.82.133/24 into its network form
# 10.213.82.0/24, so the firewall rule matches the whole subnet.
to_network_cidr() {
  local addr="${1%/*}" prefix="${1#*/}" mask n o1 o2 o3 o4
  IFS=. read -r o1 o2 o3 o4 <<<"$addr"
  mask=$(( (0xFFFFFFFF << (32 - prefix)) & 0xFFFFFFFF ))
  n=$(( (o1 << 24 | o2 << 16 | o3 << 8 | o4) & mask ))
  printf '%d.%d.%d.%d/%d\n' $((n >> 24 & 255)) $((n >> 16 & 255)) $((n >> 8 & 255)) $((n & 255)) "$prefix"
}

case "${1:-}" in
  -h|--help) usage;;
esac
CIDR="${1:-}"
if [[ -z "$CIDR" ]]; then
  CIDR=$(detect_lan_cidr)
fi
if [[ "$CIDR" != */* ]]; then
  echo "error: expected a CIDR like 192.168.1.0/24, got: $CIDR" >&2
  usage 1
fi
CIDR=$(to_network_cidr "$CIDR")
echo "Opening Love Letter ports for source subnet: $CIDR"

RULE_CLIENT="rule family=ipv4 source address=$CIDR port port=${P_CLIENT%/*} protocol=${P_CLIENT#*/} accept"
RULE_SERVER="rule family=ipv4 source address=$CIDR port port=${P_SERVER%/*} protocol=${P_SERVER#*/} accept"

add_rich() { # $1 = port/proto, $2 = rule text
  if firewall-cmd --permanent --query-rich-rule="$2" >/dev/null 2>&1; then
    echo "already open: $1 for $CIDR"
  elif firewall-cmd --permanent --add-rich-rule="$2"; then
    echo "opened: $1 (source $CIDR only)"
  else
    echo "error: failed to add the rule for $1 (see the firewall-cmd error above)" >&2
    exit 1
  fi
}

add_rich "$P_CLIENT" "$RULE_CLIENT"
add_rich "$P_SERVER" "$RULE_SERVER"

firewall-cmd --reload >/dev/null

# Verify the rules are live in the runtime config, not just on disk.
if firewall-cmd --query-rich-rule="$RULE_CLIENT" >/dev/null 2>&1 \
   && firewall-cmd --query-rich-rule="$RULE_SERVER" >/dev/null 2>&1; then
  echo "verified: both rules are active"
else
  echo "warning: rules not active in the runtime config — check with:" >&2
  echo "  sudo firewall-cmd --list-all" >&2
fi

echo "done — friends on $CIDR can open http://<this-machine-ip>:5173"
echo "rollback with: sudo ./scripts/lan-deny.sh"
