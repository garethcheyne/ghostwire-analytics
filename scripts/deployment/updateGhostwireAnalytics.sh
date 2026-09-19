#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Ghostwire Analytics Deployment Script
#  Handles fresh installs and updates on the server (Docker Compose).
#
#  Usage:
#    ./updateGhostwireAnalytics.sh              # Interactive (prompts before deploy)
#    ./updateGhostwireAnalytics.sh --deploy     # Pull + back up + build + deploy
#    ./updateGhostwireAnalytics.sh --pull-only  # Pull code only, don't deploy
#    ./updateGhostwireAnalytics.sh --rollback   # Go back to the image before the last deploy
#
#  Settings (environment variables, all optional):
#    REPO_DIR   where the code lives            (default /opt/ghostwire-analytics)
#    BRANCH     branch to deploy                 (default main)
#    BACKUPS    "true" keeps the daily backup service running (docker compose --profile backup);
#               defaults to BACKUPS in the .env
#
#  Deploy notifications go to Telegram when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set in
#  the .env (TELEGRAM_NOTIFICATIONS_ENABLED=true).
# ═══════════════════════════════════════════════════════════════════

set -e

REPO_DIR="${REPO_DIR:-/opt/ghostwire-analytics}"
BRANCH="${BRANCH:-main}"
REPO_URL="https://github.com/garethcheyne/ghostwire-analytics.git"
IMAGE="ghostwire-analytics"
DB_NAME="ghostwire_analytics"
DB_USER="ghostwire"
BACKUP_DIR="$REPO_DIR/backups"
REPORT_DIR="$REPO_DIR/deploy-reports"
MIGRATIONS_DIR="prisma/migrations"

# ── Parse flags ──────────────────────────────────────────────────
AUTO_DEPLOY=false
PULL_ONLY=false
ROLLBACK=false
for arg in "$@"; do
  case "$arg" in
    --deploy)    AUTO_DEPLOY=true ;;
    --pull-only) PULL_ONLY=true ;;
    --rollback)  ROLLBACK=true ;;
    -h|--help)   sed -n '2,20p' "$0"; exit 0 ;;
    *)           echo "Unknown option: $arg (see --help)"; exit 1 ;;
  esac
done

log()  { echo "  $1  $2"; }
header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}
fail() { echo ""; echo "❌  $1"; exit 1; }

compose() {
  if [ "$BACKUPS" = "true" ]; then
    docker compose --profile backup "$@"
  else
    docker compose "$@"
  fi
}

# ── Load only the .env values this script needs ──────────────────
# Values may be quoted (install.sh single-quotes anything that could contain $ or #).
env_value() {
  grep -E "^$1=" "$REPO_DIR/.env" 2>/dev/null | tail -n1 | cut -d= -f2- \
    | sed -e "s/^'\(.*\)'$/\1/" -e 's/^"\(.*\)"$/\1/'
}

if [ -f "$REPO_DIR/.env" ]; then
  TELEGRAM_BOT_TOKEN=$(env_value TELEGRAM_BOT_TOKEN)
  TELEGRAM_CHAT_ID=$(env_value TELEGRAM_CHAT_ID)
  TELEGRAM_NOTIFICATIONS_ENABLED=$(env_value TELEGRAM_NOTIFICATIONS_ENABLED)
  APP_URL=$(env_value BETTER_AUTH_URL)
  # The backup service choice made at install time, unless set for this run.
  BACKUPS="${BACKUPS:-$(env_value BACKUPS)}"
fi

# Telegram helper (best-effort — never blocks a deploy)
notify() {
  if [ "$TELEGRAM_NOTIFICATIONS_ENABLED" != "true" ] || [ -z "$TELEGRAM_BOT_TOKEN" ] || [ -z "$TELEGRAM_CHAT_ID" ]; then
    return 0
  fi
  curl -s -m 10 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    -H "Content-Type: application/json" \
    -d "{\"chat_id\":\"${TELEGRAM_CHAT_ID}\",\"text\":\"$1\",\"parse_mode\":\"HTML\",\"disable_web_page_preview\":true}" \
    > /dev/null 2>&1 || true
}

HOSTNAME=$(hostname)
git_info() {
  GIT_COMMIT=$(cd "$REPO_DIR" 2>/dev/null && git rev-parse --short HEAD 2>/dev/null || echo "unknown")
  GIT_MSG=$(cd "$REPO_DIR" 2>/dev/null && git log -1 --pretty=%s 2>/dev/null | sed 's/"/\\"/g' || echo "")
}
git_info

# ── Trap: notify on any unexpected failure ───────────────────────
on_error() {
  local exit_code=$?
  local line_no=$1
  notify "❌ <b>Ghostwire Analytics — Deploy Failed</b>\n\nScript failed at line ${line_no} (exit code ${exit_code})\nHost: ${HOSTNAME}\nCommit: ${GIT_COMMIT}"
  echo ""
  echo "❌  Deployment failed at line $line_no (exit code $exit_code)"
  echo "     Roll back with: $0 --rollback"
  exit $exit_code
}
trap 'on_error $LINENO' ERR

# ── Helpers ──────────────────────────────────────────────────────
db_running() {
  [ -n "$(docker compose ps -q --status running db 2>/dev/null)" ]
}

# Prints the number of migrations on disk that the database hasn't applied, then their names.
pending_migrations() {
  local on_disk applied pending="" count=0
  on_disk=$(find "$REPO_DIR/$MIGRATIONS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | sort)
  applied=$(docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -t -A \
    -c "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL;" 2>/dev/null || true)

  while IFS= read -r migration; do
    [ -z "$migration" ] && continue
    if ! echo "$applied" | grep -qx "$migration"; then
      pending="${pending}    ${migration}\n"
      count=$((count + 1))
    fi
  done <<EOF
$on_disk
EOF

  echo "$count"
  [ "$count" -gt 0 ] && printf "%b" "$pending"
  return 0
}

# Waits for the container's healthcheck, then checks /api/health (app + database).
wait_healthy() {
  local container status i
  container=$(docker compose ps -q app)
  log "⏳" "Waiting for the app (up to 3 minutes; migrations run on start)..."

  for i in $(seq 1 36); do
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "starting")
    printf "   Attempt %d/36 — %s\r" "$i" "$status"
    if [ "$status" = "healthy" ]; then
      echo ""
      if docker compose exec -T app wget -qO- http://127.0.0.1:3000/api/health 2>/dev/null | grep -q '"ok":true'; then
        return 0
      fi
      log "⚠️" "The app is up but /api/health reports a database problem."
      return 1
    fi
    if [ "$status" = "unhealthy" ] || [ "$status" = "exited" ]; then
      echo ""
      return 1
    fi
    sleep 5
  done
  echo ""
  return 1
}

show_recent_errors() {
  echo ""
  log "📋" "Last log lines:"
  docker compose logs --tail 25 app 2>&1 | sed 's/^/     /' || true
}

# ── Rollback ─────────────────────────────────────────────────────
if [ "$ROLLBACK" = true ]; then
  header "Rollback — back to the previous image"
  cd "$REPO_DIR" || fail "No install at $REPO_DIR"

  if ! docker image inspect "$IMAGE:previous" > /dev/null 2>&1; then
    fail "No $IMAGE:previous image to roll back to."
  fi

  log "⚠️" "Database migrations are not undone. If the last deploy added migrations, restore the"
  log "  " "pre-deploy backup from $BACKUP_DIR as well (see the end of this script's output)."
  if [ "$AUTO_DEPLOY" != true ]; then
    read -p "↩️  Roll back now? (yes/no): " confirm
    [ "$confirm" = "yes" ] || { echo "  Cancelled."; exit 0; }
  fi

  docker tag "$IMAGE:previous" "$IMAGE:latest"
  compose up -d --no-deps --force-recreate --no-build app

  if wait_healthy; then
    log "✅" "Rolled back and healthy."
    notify "↩️ <b>Ghostwire Analytics — Rolled back</b>\n\nHost: ${HOSTNAME}"
  else
    show_recent_errors
    fail "Rolled back, but the app isn't healthy. Check: docker compose logs -f app"
  fi
  exit 0
fi

# ── Step 1: Pull latest code ─────────────────────────────────────
header "Step 1 — Pull latest code"

export GIT_TERMINAL_PROMPT=0

if [ ! -d "$REPO_DIR/.git" ]; then
  log "📥" "Cloning $REPO_URL into $REPO_DIR..."
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
else
  cd "$REPO_DIR"
  log "📥" "Fetching $BRANCH..."
  git fetch origin "$BRANCH"
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH")
  if [ "$LOCAL" = "$REMOTE" ]; then
    log "✅" "Already up to date (${LOCAL:0:9})"
  else
    log "🔄" "Updating ${LOCAL:0:9} → ${REMOTE:0:9}"
    git log --oneline "$LOCAL..$REMOTE" | head -20 | sed 's/^/       /'
    git reset --hard "origin/$BRANCH"
  fi
fi
git_info
chmod +x scripts/deployment/*.sh 2>/dev/null || true

log "✅" "Code is at $GIT_COMMIT: $GIT_MSG"

if [ "$PULL_ONLY" = true ]; then
  echo ""
  echo "  Pull complete. Run again without --pull-only to deploy."
  exit 0
fi

# ── Step 2: Check the environment ────────────────────────────────
header "Step 2 — Check environment"

if [ ! -f "$REPO_DIR/.env" ]; then
  fail ".env missing at $REPO_DIR/.env — copy .env.example to .env and fill it in first."
fi

SECRET=$(env_value BETTER_AUTH_SECRET)
if [ ${#SECRET} -lt 32 ]; then
  fail "BETTER_AUTH_SECRET in .env is missing or shorter than 32 characters (generate one: npx auth secret)."
fi
case "$(env_value BETTER_AUTH_URL)" in
  https://*) ;;
  *) log "⚠️" "BETTER_AUTH_URL isn't an https:// address; sign-in needs HTTPS in production." ;;
esac
[ -n "$(env_value POSTGRES_PASSWORD)" ] || log "⚠️" "POSTGRES_PASSWORD isn't set; the database uses the default password."
log "✅" ".env looks usable."

command -v docker > /dev/null || fail "Docker isn't installed."
docker compose version > /dev/null 2>&1 || fail "Docker Compose v2 isn't available."

# ── Step 3: Pre-deploy backup ────────────────────────────────────
header "Step 3 — Pre-deploy backup"

mkdir -p "$BACKUP_DIR"
if db_running; then
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  BACKUP_FILE="$BACKUP_DIR/predeploy-${TIMESTAMP}.dump"
  log "💾" "Backing up the database..."
  docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$BACKUP_FILE.tmp"
  mv "$BACKUP_FILE.tmp" "$BACKUP_FILE"
  log "✅" "Backup saved: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
  # Keep the last 10 pre-deploy backups (the daily ones are rotated by the backup service).
  ls -1t "$BACKUP_DIR"/predeploy-*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f
else
  log "ℹ️" "Database isn't running — skipping backup (fresh install)."
fi

# ── Step 4: Confirm ──────────────────────────────────────────────
if [ "$AUTO_DEPLOY" != true ]; then
  echo ""
  read -p "🚀 Deploy $GIT_COMMIT now? (yes/no): " confirm
  if [ "$confirm" != "yes" ]; then
    echo ""
    echo "  Skipped. Run again with --deploy or answer 'yes' when ready."
    exit 0
  fi
fi

# ── Step 5: Build and deploy ─────────────────────────────────────
header "Step 5 — Build, migrate and deploy"

notify "🚀 <b>Ghostwire Analytics — Deploy Starting</b>\n\nHost: ${HOSTNAME}\nCommit: <code>${GIT_COMMIT}</code>\n${GIT_MSG}"

if docker image inspect "$IMAGE:latest" > /dev/null 2>&1; then
  log "🏷" "Keeping the current image as $IMAGE:previous for rollback..."
  docker tag "$IMAGE:latest" "$IMAGE:previous"
fi

log "🔨" "Building the image..."
compose build app

log "🧱" "Making sure the database is running..."
compose up -d db
for i in $(seq 1 30); do
  docker compose exec -T db pg_isready -U "$DB_USER" -d "$DB_NAME" > /dev/null 2>&1 && break
  sleep 2
done

mkdir -p "$REPORT_DIR"
REPORT="$REPORT_DIR/deploy-$(date +%Y%m%d-%H%M%S).log"
PRE=$(pending_migrations)
PRE_COUNT=$(echo "$PRE" | head -n1)
{
  echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host=$HOSTNAME"
  echo "commit=$GIT_COMMIT"
  echo "pending_before=$PRE_COUNT"
  echo "$PRE" | tail -n +2
} > "$REPORT"
log "🗃️" "Migrations to apply: $PRE_COUNT (the app applies them as it starts)"
[ "$PRE_COUNT" -gt 0 ] && echo "$PRE" | tail -n +2

log "🔄" "Restarting the app (the database is left running)..."
compose up -d --no-deps --force-recreate app
[ "$BACKUPS" = "true" ] && compose up -d backup

# ── Step 6: Health check ─────────────────────────────────────────
header "Step 6 — Health check"

if wait_healthy; then
  POST=$(pending_migrations)
  POST_COUNT=$(echo "$POST" | head -n1)
  echo "pending_after=$POST_COUNT" >> "$REPORT"

  if [ "$POST_COUNT" -gt 0 ]; then
    show_recent_errors
    notify "⚠️ <b>Ghostwire Analytics — Migrations pending</b>\n\n${POST_COUNT} migration(s) not applied\nHost: ${HOSTNAME}\nCommit: <code>${GIT_COMMIT}</code>"
    fail "The app started but $POST_COUNT migration(s) aren't applied. Report: $REPORT"
  fi

  log "✅" "App is healthy and all migrations are applied."
  notify "✅ <b>Ghostwire Analytics — Deploy Successful</b>\n\nHost: ${HOSTNAME}\nCommit: <code>${GIT_COMMIT}</code>\n${GIT_MSG}"
else
  echo "healthy=false" >> "$REPORT"
  show_recent_errors
  notify "❌ <b>Ghostwire Analytics — Deploy Failed</b>\n\nApp did not become healthy\nHost: ${HOSTNAME}\nCommit: <code>${GIT_COMMIT}</code>"
  echo ""
  echo "  Roll back to the previous image:  $0 --rollback"
  fail "The app didn't become healthy. Report: $REPORT"
fi

# ── Step 7: Status ───────────────────────────────────────────────
header "Step 7 — Services"
echo ""
compose ps --format "table {{.Service}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || compose ps

# ── Done ─────────────────────────────────────────────────────────
header "🎉  Deployment complete"
echo ""
echo "  App:       ${APP_URL:-http://localhost:8770}"
echo "  Commit:    $GIT_COMMIT  $GIT_MSG"
echo "  Backups:   $BACKUP_DIR/"
echo "  Report:    $REPORT"
echo ""
echo "  Useful commands:"
echo "    Live logs:      docker compose logs -f app"
echo "    Errors:         docker compose exec app sh -c 'grep -h \"\\\"level\\\":\\\"error\\\"\" /app/logs/*.log | tail'"
echo "    Traffic stats:  docker compose exec app sh -c 'grep -h \"\\\"event\\\":\\\"stats\\\"\" /app/logs/*.log | tail -3'"
echo "    Roll back:      $0 --rollback"
echo "    Restore DB:     docker compose exec -T db pg_restore -U $DB_USER -d $DB_NAME --clean --if-exists < $BACKUP_DIR/<file>.dump"
echo ""
