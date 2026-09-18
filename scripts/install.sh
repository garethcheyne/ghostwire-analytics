#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  Ghostwire Analytics — installer
#
#  Sets up a new server in one go: downloads the code, asks a few questions (your domain and the
#  first admin), creates random secrets for the database and sign-in, writes the .env, then builds
#  and starts everything with Docker.
#
#    curl -fsSL https://raw.githubusercontent.com/garethcheyne/ghostwire-analytics/main/scripts/install.sh | sudo bash
#
#  Needs: Docker with Compose v2, git, and curl. Run it again later to update (it keeps your .env).
#
#  Answers can be given up front instead of typed (e.g. for automation, with --yes):
#    GW_DOMAIN=analytics.example.com   GW_PORT=8770          GW_DIR=/opt/ghostwire-analytics
#    GW_ADMIN_USERNAME=admin           GW_ADMIN_EMAIL=...    GW_ADMIN_PASSWORD=... (blank = random)
#    GW_BACKUPS=yes                    GW_RETENTION_DAYS=... (blank = keep everything)
#    GW_DB_PORT=5436 (the database's port on localhost)
# ═══════════════════════════════════════════════════════════════════

set -e

REPO_URL="https://github.com/garethcheyne/ghostwire-analytics.git"
BRANCH="${GW_BRANCH:-main}"
INSTALL_DIR="${GW_DIR:-/opt/ghostwire-analytics}"

ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    -y|--yes) ASSUME_YES=true ;;
    -h|--help) sed -n '2,19p' "$0" 2>/dev/null || true; exit 0 ;;
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

# Questions read from the terminal, so this works when piped from curl.
TTY=/dev/tty
if [ "$ASSUME_YES" != true ] && ! (exec < "$TTY") 2>/dev/null; then
  fail "No terminal to ask questions on. Set the GW_* variables and run with --yes."
fi

# ask VAR "Question" "default" [secret]
ask() {
  local var="$1" question="$2" default="$3" secret="$4" answer=""
  if [ -n "${!var}" ]; then return 0; fi
  if [ "$ASSUME_YES" = true ]; then
    printf -v "$var" '%s' "$default"
    return 0
  fi
  if [ -n "$default" ] && [ "$secret" != "secret" ]; then
    read -r -p "  $question [$default]: " answer < "$TTY"
  elif [ "$secret" = "secret" ]; then
    read -r -s -p "  $question: " answer < "$TTY"
    echo ""
  else
    read -r -p "  $question: " answer < "$TTY"
  fi
  printf -v "$var" '%s' "${answer:-$default}"
}

confirm() {
  local answer
  [ "$ASSUME_YES" = true ] && return 0
  read -r -p "  $1 [Y/n]: " answer < "$TTY"
  case "$answer" in [nN]*) return 1 ;; *) return 0 ;; esac
}

# A random secret: letters and digits only, so it's safe in URLs and .env files.
random_secret() {
  local length="$1"
  if command -v openssl > /dev/null; then
    openssl rand -base64 $((length * 2)) | tr -dc 'A-Za-z0-9' | head -c "$length"
  else
    tr -dc 'A-Za-z0-9' < /dev/urandom | head -c "$length"
  fi
}

# Whether something on this server already listens on a TCP port.
port_in_use() {
  local port="$1"
  if command -v ss > /dev/null; then
    ss -Htln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$port$" && return 0
  elif command -v netstat > /dev/null; then
    netstat -tln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$port$" && return 0
  fi
  # Ports published by Docker containers (running or stopped) would clash on start.
  docker ps -a --format '{{.Ports}}' 2>/dev/null | grep -qE "[:.]$port->" && return 0
  (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null && return 0
  return 1
}

# The first free port from $1 upwards.
free_port() {
  local port="$1"
  while port_in_use "$port"; do port=$((port + 1)); done
  echo "$port"
}

# ── 1. Requirements ──────────────────────────────────────────────
header "Ghostwire Analytics installer"

command -v git > /dev/null    || fail "git is not installed (e.g. apt install git)."
command -v curl > /dev/null   || fail "curl is not installed (e.g. apt install curl)."
command -v docker > /dev/null || fail "Docker is not installed. See https://docs.docker.com/engine/install/"
docker compose version > /dev/null 2>&1 || fail "Docker Compose v2 is not available (docker compose version)."
docker info > /dev/null 2>&1 || fail "Can't talk to Docker. Run this with sudo, or add your user to the docker group."

PARENT_DIR=$(dirname "$INSTALL_DIR")
if [ ! -w "$PARENT_DIR" ] && [ ! -w "$INSTALL_DIR" ]; then
  fail "Can't write to $PARENT_DIR. Run with sudo, or set GW_DIR to a folder you own."
fi
say "✅" "Docker, Compose, git and curl are ready."

# ── 2. Code ──────────────────────────────────────────────────────
header "Download"

if [ -d "$INSTALL_DIR/.git" ]; then
  say "📥" "Updating the code in $INSTALL_DIR..."
  git -C "$INSTALL_DIR" fetch --quiet origin "$BRANCH"
  git -C "$INSTALL_DIR" reset --quiet --hard "origin/$BRANCH"
else
  say "📥" "Downloading into $INSTALL_DIR..."
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
chmod +x "$INSTALL_DIR"/scripts/*.sh "$INSTALL_DIR"/scripts/deployment/*.sh 2>/dev/null || true
say "✅" "Code is at $(git -C "$INSTALL_DIR" rev-parse --short HEAD)."

# ── 3. Settings ──────────────────────────────────────────────────
ENV_FILE="$INSTALL_DIR/.env"
WRITE_ENV=true
GENERATED_PASSWORD=""

if [ -f "$ENV_FILE" ]; then
  header "Settings"
  say "ℹ️" "Found an existing .env; keeping it (its secrets match your database)."
  WRITE_ENV=false
fi

if [ "$WRITE_ENV" = true ]; then
  header "A few questions"
  echo "  Press Enter to accept the default in [brackets]."
  echo ""

  GW_DOMAIN="${GW_DOMAIN:-}"
  while [ -z "$GW_DOMAIN" ]; do
    ask GW_DOMAIN "Domain the app will be reached at (e.g. analytics.example.com)" ""
    GW_DOMAIN=$(echo "$GW_DOMAIN" | sed -e 's#^https\?://##' -e 's#/.*$##' | tr 'A-Z' 'a-z')
    if [ -z "$GW_DOMAIN" ] && [ "$ASSUME_YES" = true ]; then fail "Set GW_DOMAIN."; fi
  done

  SUGGESTED_PORT=$(free_port 8770)
  [ "$SUGGESTED_PORT" != 8770 ] && say "ℹ️" "Port 8770 is taken on this server; suggesting $SUGGESTED_PORT."
  while :; do
    ask GW_PORT "Port on this server for the app (your reverse proxy points here)" "$SUGGESTED_PORT"
    case "$GW_PORT" in ''|*[!0-9]*) say "⚠️" "The port must be a number."; GW_PORT="" ;; esac
    if [ -n "$GW_PORT" ] && port_in_use "$GW_PORT"; then
      say "⚠️" "Port $GW_PORT is already in use on this server."
      [ "$ASSUME_YES" = true ] && fail "GW_PORT $GW_PORT is in use; choose another."
      GW_PORT=""
    fi
    [ -n "$GW_PORT" ] && break
  done
  # The database only listens on localhost; pick a free port so it can't clash either.
  GW_DB_PORT="${GW_DB_PORT:-$(free_port 5436)}"
  ask GW_ADMIN_USERNAME "First admin's username" "admin"
  ask GW_ADMIN_EMAIL "First admin's email" "admin@$GW_DOMAIN"
  ask GW_ADMIN_PASSWORD "First admin's password (Enter for a random one)" "" secret
  if [ -z "$GW_ADMIN_PASSWORD" ]; then
    GENERATED_PASSWORD=$(random_secret 20)
    GW_ADMIN_PASSWORD="$GENERATED_PASSWORD"
  elif [ ${#GW_ADMIN_PASSWORD} -lt 8 ]; then
    fail "The admin password needs at least 8 characters."
  fi
  ask GW_BACKUPS "Daily database backups to $INSTALL_DIR/backups? (yes/no)" "yes"
  ask GW_RETENTION_DAYS "Delete replays, heatmaps and errors after how many days? (Enter keeps them)" ""


  echo ""
  echo "  Domain:    https://$GW_DOMAIN"
  echo "  Port:      $GW_PORT (database: 127.0.0.1:$GW_DB_PORT)"
  echo "  Admin:     $GW_ADMIN_USERNAME <$GW_ADMIN_EMAIL>"
  echo "  Backups:   $GW_BACKUPS"
  echo ""
  confirm "Install with these settings?" || fail "Cancelled; nothing was changed."

  # Written with a restrictive umask: the file holds every secret.
  umask 077
  cat > "$ENV_FILE" <<EOF
# Ghostwire Analytics settings, written by scripts/install.sh on $(date -u +%Y-%m-%d).
# Secrets were generated at random. Keep this file private and back it up with the database:
# POSTGRES_PASSWORD must stay the same for as long as the database exists.

POSTGRES_PASSWORD=$(random_secret 32)
BETTER_AUTH_SECRET=$(random_secret 48)
BETTER_AUTH_URL=https://$GW_DOMAIN
APP_PORT=$GW_PORT
# The database is only reachable from this server, on this port.
DB_PORT=$GW_DB_PORT
# Keep the daily backup service (docker compose --profile backup) running on updates.
BACKUPS=$(case "$GW_BACKUPS" in [yY]*) echo true ;; *) echo false ;; esac)

# The first admin (only used while the database has no users).
ADMIN_USERNAME=$GW_ADMIN_USERNAME
ADMIN_EMAIL=$GW_ADMIN_EMAIL
ADMIN_PASSWORD=$GW_ADMIN_PASSWORD

# Delete raw replay, heatmap and error data after N days (blank keeps everything).
DATA_RETENTION_DAYS=$GW_RETENTION_DAYS

# Optional, see .env.example: SMTP_URL / SMTP_FROM for email, OIDC_* for single sign-on,
# TELEGRAM_* for deploy notifications.
EOF
  umask 022
  say "✅" "Wrote $ENV_FILE (readable only by you)."
fi

# ── 4. Build and start ───────────────────────────────────────────
header "Build and start (a few minutes the first time)"

export BACKUPS=$(grep -E '^BACKUPS=' "$ENV_FILE" | cut -d= -f2-)
REPO_DIR="$INSTALL_DIR" bash "$INSTALL_DIR/scripts/deployment/updateGhostwireAnalytics.sh" --deploy

# ── 5. Report ────────────────────────────────────────────────────
setting() { grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2-; }

URL=$(setting BETTER_AUTH_URL)
PORT=$(setting APP_PORT); PORT=${PORT:-8770}
DB_PORT=$(setting DB_PORT); DB_PORT=${DB_PORT:-5436}
DOMAIN=${URL#https://}; DOMAIN=${DOMAIN#http://}
ADMIN=$(setting ADMIN_USERNAME)
RETENTION=$(setting DATA_RETENTION_DAYS)
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
HEALTH=$(curl -s -m 10 "http://127.0.0.1:$PORT/api/health" 2>/dev/null || true)
VERSION=$(git -C "$INSTALL_DIR" rev-parse --short HEAD)
REPORT_FILE="$INSTALL_DIR/install-report.txt"

if [ -n "$GENERATED_PASSWORD" ]; then
  PASSWORD_NOTE="random; shown once on screen at the end of the install (also ADMIN_PASSWORD in .env)"
else
  PASSWORD_NOTE="the one you chose (ADMIN_PASSWORD in .env)"
fi
if [ "$(setting BACKUPS)" = true ]; then
  BACKUP_NOTE="$INSTALL_DIR/backups: daily (14 kept), plus a copy before each update"
else
  BACKUP_NOTE="daily backups off; a copy is still taken before each update ($INSTALL_DIR/backups)"
fi

report() {
  echo "Ghostwire Analytics — install report"
  echo "$(date -u '+%Y-%m-%d %H:%M UTC') on $(hostname), version $VERSION"
  echo ""
  echo "WEB ADDRESS"
  echo "  Public URL        $URL"
  echo "  App on server     http://${SERVER_IP:-127.0.0.1}:$PORT   (point your reverse proxy here)"
  echo "  Health check      http://127.0.0.1:$PORT/api/health  ->  ${HEALTH:-no answer}"
  echo ""
  echo "SIGN IN"
  echo "  Username          ${ADMIN:-admin}"
  echo "  Password          $PASSWORD_NOTE"
  echo "  First steps       change the password, turn on two-factor, then add your websites"
  echo ""
  echo "HTTPS (needed for sign-in, installing the app on phones, and notifications)"
  echo "  1. DNS: point $DOMAIN at this server (${SERVER_IP:-its IP address})."
  echo "  2. Reverse proxy with TLS. In ghostwire-proxy: a proxy host for $DOMAIN forwarding to"
  echo "     http://${SERVER_IP:-127.0.0.1}:$PORT, with a Let's Encrypt certificate and websockets on."
  echo "     It passes X-Real-IP / X-Forwarded-For, which is what gives visitors their location."
  echo ""
  echo "FILES"
  echo "  Install folder    $INSTALL_DIR"
  echo "  Settings          $ENV_FILE   (all secrets: keep it private and backed up)"
  echo "  Backups           $BACKUP_NOTE"
  echo "  Logs              Docker volume app-logs (/app/logs in the container), 30 days"
  if [ -n "$RETENTION" ]; then
    echo "  Data retention    replays, heatmaps and errors deleted after $RETENTION days"
  else
    echo "  Data retention    keep everything"
  fi
  echo ""
  echo "SERVICES"
  (cd "$INSTALL_DIR" && docker compose ps --format '  {{.Service}}  {{.Status}}  {{.Ports}}' 2>/dev/null) || true
  echo "  Database          PostgreSQL 17 on 127.0.0.1:$DB_PORT only (user ghostwire, database ghostwire_analytics)"
  echo ""
  echo "EVERYDAY COMMANDS (run from $INSTALL_DIR)"
  echo "  Update            sudo bash scripts/install.sh   (keeps .env, backs up first)"
  echo "  Roll back         sudo bash scripts/deployment/updateGhostwireAnalytics.sh --rollback"
  echo "  Live logs         docker compose logs -f app"
  echo "  Errors only       docker compose exec app sh -c 'grep -h level.:.error /app/logs/*.log | tail'"
  echo "  Traffic stats     docker compose exec app sh -c 'grep -h event.:.stats /app/logs/*.log | tail -3'"
  echo "  Restore a backup  docker compose exec -T db pg_restore -U ghostwire -d ghostwire_analytics --clean --if-exists < backups/<file>.dump"
  echo ""
  echo "OPTIONAL SETTINGS (add to .env, then run the update)"
  echo "  Email alerts and reports   SMTP_URL, SMTP_FROM"
  echo "  Single sign-on             OIDC_DISCOVERY_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_NAME"
  echo "  Deploy notifications       TELEGRAM_NOTIFICATIONS_ENABLED, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID"
  echo "  (each is described in .env.example)"
}

umask 077
report > "$REPORT_FILE"
umask 022

header "🎉  Ghostwire Analytics is installed"
echo ""
report | sed 's/^/  /'
if [ -n "$GENERATED_PASSWORD" ]; then
  echo ""
  echo "  ┌────────────────────────────────────────────────────────────"
  echo "  │  Admin password (random, shown only now):  $GENERATED_PASSWORD"
  echo "  └────────────────────────────────────────────────────────────"
fi
echo ""
echo "  This report is saved in $REPORT_FILE (without the password)."
echo ""
