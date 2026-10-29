#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Ghostwire Analytics — uninstaller
#
#  Removes Ghostwire Analytics from this server completely: its containers, the database and log
#  volumes (ALL analytics data), its Docker images and network, backups, logs, deploy and install
#  reports, and the .env with its secrets. At the end it asks whether to delete the code (the git
#  clone) too.
#
#    curl -fsSL https://raw.githubusercontent.com/garethcheyne/ghostwire-analytics/main/scripts/uninstall.sh | sudo bash
#
#  or, from the install:  sudo bash /opt/ghostwire-analytics/scripts/uninstall.sh
#
#  This can't be undone. It offers to save a last database backup outside the install first.
#
#  For automation (with --yes):
#    GW_DIR=/opt/ghostwire-analytics   where it's installed
#    GW_FINAL_BACKUP=yes|no            save a last backup first (default yes)
#    GW_BACKUP_TO=/root                where that backup goes (default: the folder above GW_DIR)
#    GW_DELETE_CODE=yes|no             delete the git clone as well (default no)
# ═══════════════════════════════════════════════════════════════════

set -e

INSTALL_DIR="${GW_DIR:-/opt/ghostwire-analytics}"
INSTALL_DIR="${INSTALL_DIR%/}"
IMAGE="ghostwire-analytics"

ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=true ;;
    -h|--help) sed -n '2,22p' "$0" 2>/dev/null || true; exit 0 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

say()    { echo "  $1  $2"; }
header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
fail()   { echo ""; echo "❌  $1"; exit 1; }

TTY=/dev/tty
if [ "$ASSUME_YES" != true ] && ! (exec < "$TTY") 2>/dev/null; then
  fail "No terminal to ask questions on. Set the GW_* variables and run with --yes."
fi

# yes_no "Question" default(y|n) [VAR with a preset answer]
yes_no() {
  local question="$1" default="$2" preset="$3" answer hint
  if [ -n "$preset" ]; then
    case "$preset" in [yY]*|true|1) return 0 ;; *) return 1 ;; esac
  fi
  if [ "$ASSUME_YES" = true ]; then
    [ "$default" = y ] && return 0 || return 1
  fi
  [ "$default" = y ] && hint="Y/n" || hint="y/N"
  read -r -p "  $question [$hint]: " answer < "$TTY"
  answer="${answer:-$default}"
  case "$answer" in [yY]*) return 0 ;; *) return 1 ;; esac
}

# Values may be quoted (install.sh single-quotes anything that could contain $ or #).
env_value() {
  grep -E "^$1=" "$INSTALL_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- \
    | sed -e "s/^'\(.*\)'$/\1/" -e 's/^"\(.*\)"$/\1/'
}

# ── 1. What's here ───────────────────────────────────────────────
header "Ghostwire Analytics uninstaller"

command -v docker > /dev/null || fail "Docker is not installed; there's nothing of ours to remove in Docker."
docker info > /dev/null 2>&1 || fail "Can't talk to Docker. Run this with sudo, or add your user to the docker group."

# Compose names everything after the install folder (its "project").
PROJECT=$(basename "$INSTALL_DIR" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9_-')
HAS_DIR=false
[ -f "$INSTALL_DIR/docker-compose.yml" ] && HAS_DIR=true

CONTAINERS=$(docker ps -a -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null || true)
VOLUMES=$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null || true)
NETWORKS=$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null || true)
IMAGES=$(docker image ls -q "$IMAGE" 2>/dev/null | sort -u || true)

if [ "$HAS_DIR" != true ] && [ -z "$CONTAINERS$VOLUMES$NETWORKS$IMAGES" ]; then
  fail "Nothing found: no install at $INSTALL_DIR and no Docker resources for \"$PROJECT\". Set GW_DIR if it's installed elsewhere."
fi

count() { [ -z "$1" ] && echo 0 || echo "$1" | wc -l | tr -d ' '; }

echo "  This permanently removes from this server:"
echo ""
echo "    • $(count "$CONTAINERS") container(s) of the \"$PROJECT\" stack (app, database, backups)"
echo "    • $(count "$VOLUMES") volume(s): the database and the app logs — ALL analytics data"
echo "    • the $IMAGE images ($(count "$IMAGES")) and the stack's network"
if [ "$HAS_DIR" = true ]; then
  for item in .env backups logs deploy-reports install-report.txt; do
    [ -e "$INSTALL_DIR/$item" ] && echo "    • $INSTALL_DIR/$item"
  done
fi
[ -f "$(dirname "$INSTALL_DIR")/updateGhostwireAnalytics.sh" ] &&
  echo "    • $(dirname "$INSTALL_DIR")/updateGhostwireAnalytics.sh"
echo ""
echo "  The postgres image is kept (other apps may use it). You'll be asked about the code last."
echo ""

if [ "$ASSUME_YES" != true ]; then
  read -r -p "  Type DELETE to remove all of this: " typed < "$TTY"
  [ "$typed" = "DELETE" ] || fail "Cancelled; nothing was removed."
fi

# ── 2. A last backup ─────────────────────────────────────────────
FINAL_BACKUP=""
DB_RUNNING=false
if [ "$HAS_DIR" = true ] && (cd "$INSTALL_DIR" && [ -n "$(docker compose ps -q --status running db 2>/dev/null)" ]); then
  DB_RUNNING=true
fi

if [ "$DB_RUNNING" = true ]; then
  header "Last backup"
  if yes_no "Save a last database backup before deleting it?" y "$GW_FINAL_BACKUP"; then
    BACKUP_TO="${GW_BACKUP_TO:-$(dirname "$INSTALL_DIR")}"
    mkdir -p "$BACKUP_TO"
    FINAL_BACKUP="$BACKUP_TO/ghostwire-analytics-final-$(date +%Y%m%d-%H%M%S).dump"
    DB_USER=$(env_value POSTGRES_USER); DB_USER="${DB_USER:-ghostwire}"
    DB_NAME=$(env_value POSTGRES_DB); DB_NAME="${DB_NAME:-ghostwire_analytics}"
    (umask 077; cd "$INSTALL_DIR" && docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$FINAL_BACKUP") ||
      fail "The backup failed, so nothing was removed. Run again and answer no to skip it."
    say "💾" "Saved $FINAL_BACKUP ($(du -h "$FINAL_BACKUP" | cut -f1))"
  fi
fi

# ── 3. Docker ────────────────────────────────────────────────────
header "Removing containers, volumes and images"

if [ "$HAS_DIR" = true ]; then
  (cd "$INSTALL_DIR" && docker compose --profile backup down --volumes --remove-orphans 2>&1 | sed 's/^/     /') || true
fi

# Whatever compose didn't catch (e.g. the folder is already gone).
CONTAINERS=$(docker ps -a -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null || true)
[ -n "$CONTAINERS" ] && docker rm -f $CONTAINERS > /dev/null
VOLUMES=$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null || true)
[ -n "$VOLUMES" ] && docker volume rm -f $VOLUMES > /dev/null
NETWORKS=$(docker network ls -q --filter "label=com.docker.compose.project=$PROJECT" 2>/dev/null || true)
[ -n "$NETWORKS" ] && docker network rm $NETWORKS > /dev/null 2>&1 || true
say "✅" "Containers, volumes and network removed."

for tag in $(docker image ls --format '{{.Repository}}:{{.Tag}}' "$IMAGE" 2>/dev/null); do
  docker image rm -f "$tag" > /dev/null 2>&1 || true
done
say "✅" "Images removed."

# ── 4. Files ─────────────────────────────────────────────────────
header "Removing data files"

if [ "$HAS_DIR" = true ]; then
  for item in .env backups logs deploy-reports install-report.txt; do
    if [ -e "$INSTALL_DIR/$item" ]; then
      rm -rf "${INSTALL_DIR:?}/$item"
      say "🗑" "$INSTALL_DIR/$item"
    fi
  done
fi
UPDATER="$(dirname "$INSTALL_DIR")/updateGhostwireAnalytics.sh"
if [ -f "$UPDATER" ]; then
  rm -f "$UPDATER"
  say "🗑" "$UPDATER"
fi

# ── 5. The code ──────────────────────────────────────────────────
CODE_REMOVED=false
if [ -d "$INSTALL_DIR" ]; then
  header "The code"
  echo "  $INSTALL_DIR still holds the code (the git clone). Keeping it lets you reinstall with"
  echo "  scripts/install.sh; it holds no data or secrets any more."
  echo ""
  if yes_no "Delete $INSTALL_DIR as well?" n "$GW_DELETE_CODE"; then
    case "$INSTALL_DIR" in
      /|/opt|/usr|/home|/root|/var|/etc|"") fail "Refusing to delete $INSTALL_DIR." ;;
    esac
    cd /
    rm -rf "${INSTALL_DIR:?}"
    CODE_REMOVED=true
    say "🗑" "Deleted $INSTALL_DIR"
  else
    say "ℹ️" "Kept $INSTALL_DIR"
  fi
fi

# ── 6. Report ────────────────────────────────────────────────────
header "Ghostwire Analytics has been removed"
echo "  Removed: the containers, the database and log volumes, the images, backups, logs,"
echo "  reports and the .env."
[ "$CODE_REMOVED" = true ] && echo "  The code at $INSTALL_DIR was deleted too."
[ "$CODE_REMOVED" != true ] && [ -d "$INSTALL_DIR" ] && echo "  The code is still at $INSTALL_DIR."
if [ -n "$FINAL_BACKUP" ]; then
  echo ""
  echo "  Last backup: $FINAL_BACKUP"
  echo "  Restore it into a new install with:"
  echo "    docker compose exec -T db pg_restore -U ghostwire -d ghostwire_analytics --clean < $FINAL_BACKUP"
fi
echo ""
echo "  Remember to remove the proxy host (and DNS record) that pointed at it, and the tracking"
echo "  snippet from your sites."
echo ""
