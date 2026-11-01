#!/usr/bin/env bash
# Kept for the published one-liner, and anything else, that still calls scripts/install.sh; the
# installer is installGhostwireAnalytics.sh at the root. Piped from curl, this downloads that one
# and runs it with the same arguments (it then clones into /opt/ghostwire-analytics, or GW_DIR).
set -euo pipefail

main() {
  local here="" script
  if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
    here=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
  fi
  if [ -n "$here" ] && [ -f "$here/installGhostwireAnalytics.sh" ]; then
    exec bash "$here/installGhostwireAnalytics.sh" "$@"
  fi
  script=$(curl -fsSL https://raw.githubusercontent.com/garethcheyne/ghostwire-analytics/main/installGhostwireAnalytics.sh) \
    || { echo "Couldn't download installGhostwireAnalytics.sh from GitHub." >&2; exit 1; }
  exec bash -c "$script" installGhostwireAnalytics.sh "$@"
}

main "$@"
