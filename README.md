# Ghostwire Analytics

Self-hosted, privacy-first web analytics, part of the Ghostwire suite. Cookie-free visitor
tracking, events, funnels, journeys, retention, heatmaps and session replay, on your own
PostgreSQL.

Built with Next.js 16, shadcn/ui, Prisma 7 and Better Auth. Based on
[Umami](https://github.com/umami-software/umami) (MIT).

## Install on your server

On a Linux server with Docker (Compose v2), git and curl:

```bash
curl -fsSL https://raw.githubusercontent.com/garethcheyne/ghostwire-analytics/main/scripts/install.sh | sudo bash
```

It asks for your domain and the first admin, suggests a port that's free on the server, creates
random secrets for the database and sign-in, writes `/opt/ghostwire-analytics/.env`, builds and
starts everything, and prints a report (URL, ports, sign-in, files, commands). The report is
also saved to `install-report.txt`, without the password. Then put your domain behind HTTPS
(ghostwire-proxy or any reverse proxy) pointing at the port it chose.

Run the same command again to update: it keeps your `.env` and backs up the database first.
For automated installs, give the answers as `GW_*` variables and add `--yes` (see the top of
[`scripts/install.sh`](scripts/install.sh)).

### Uninstall

```bash
curl -fsSL https://raw.githubusercontent.com/garethcheyne/ghostwire-analytics/main/scripts/uninstall.sh | sudo bash
```

It removes everything the install created: the containers, the database and log volumes (all
analytics data), the images, backups, logs, reports and the `.env`. It offers to save a last
database backup outside the install first, asks you to type DELETE, and at the end asks whether
to delete the code in `/opt/ghostwire-analytics` too. `GW_DIR` points it at another folder.

### Run with Docker by hand

```bash
cp .env.example .env              # set POSTGRES_PASSWORD and BETTER_AUTH_SECRET (npx auth secret)
docker compose up -d --build
```

Open http://localhost:8770 and sign in as `admin` / `ghostwire` (or `ADMIN_PASSWORD` if set).
Change the password straight away.

### Beta deployment checklist

1. In `.env`: a real `BETTER_AUTH_SECRET` (`npx auth secret`), `BETTER_AUTH_URL` set to the public
   `https://` address, `ADMIN_PASSWORD` set before the first start, and a strong `POSTGRES_PASSWORD`.
2. `docker compose --profile backup up -d --build` (the app, the database and daily backups).
3. A proxy host in ghostwire-proxy pointing at port 8770, with TLS.
4. An uptime check on `https://<your host>/api/health` (200 when the app and database are up, 503
   when the database isn't).
5. Sign in, change the admin password, turn on two-factor, then add your sites.

### Installing and updating on a server

`scripts/deployment/updateGhostwireAnalytics.sh` does both: it clones or pulls `main` into
`/opt/ghostwire-analytics` (`REPO_DIR`), checks the `.env`, backs up the database to `backups/`,
keeps the running image as `ghostwire-analytics:previous`, rebuilds, restarts the app (migrations
run as it starts) and waits until `/api/health` is OK.

```bash
curl -fsSL https://raw.githubusercontent.com/garethcheyne/ghostwire-analytics/main/scripts/deployment/updateGhostwireAnalytics.sh -o /opt/updateGhostwireAnalytics.sh
bash /opt/updateGhostwireAnalytics.sh             # first run clones, then asks you to create .env
cp /opt/ghostwire-analytics/.env.example /opt/ghostwire-analytics/.env   # fill it in
bash /opt/updateGhostwireAnalytics.sh --deploy    # install; run the same command for every update
bash /opt/updateGhostwireAnalytics.sh --rollback  # back to the image before the last deploy
```

`BACKUPS=true` also keeps the daily backup service running. With `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` in `.env` (and `TELEGRAM_NOTIFICATIONS_ENABLED=true`) it reports each deploy to
Telegram. Rolling back doesn't undo database migrations; restore the pre-deploy backup for that.

### Logs

The app logs JSON lines, to `docker logs` and to daily files in the `app-logs` volume
(`/app/logs/app-YYYY-MM-DD.log`, kept `LOG_RETENTION_DAYS`, default 30). The files outlive
rebuilds and restarts.

```bash
docker compose logs -f app                                          # live
docker compose exec app sh -c 'tail -n 100 /app/logs/app-$(date +%F).log'
docker compose exec app sh -c 'grep -h "\"level\":\"error\"" /app/logs/*.log'   # every error
docker compose exec app sh -c 'grep -h "\"event\":\"stats\"" /app/logs/*.log'   # traffic
docker compose cp app:/app/logs ./logs                              # copy them out
```

Every 5 minutes there's a `stats` line with what the app took in and what it dropped and why
(`send.accepted.event`, `send.dropped.bot`, `send.dropped.rate_limited`, `errors.accepted.browser`,
`alerts.sent`, `http.server_error`...). Server errors are logged with their route and stack
(`api.server_error`, `request.error`), and background jobs log what they did (`alert.delivery`,
`email_report.sent`, `retention.removed`). Settings that break a deployment are logged at every
start (`config.auth_secret`, `config.auth_url`). `LOG_LEVEL=debug` adds more detail.

### In production

- **HTTPS**: put it behind [ghostwire-proxy](../ghostwire-proxy) (or any reverse proxy) with a
  proxy host pointing at port 8770, and set `BETTER_AUTH_URL` to the public `https://` address.
  The proxy's `X-Real-IP` / `X-Forwarded-For` headers are what give visitors their location.
- **Track your sites** with the snippet from each website's settings, or with the client
  libraries in [`packages/`](packages) (`@ghostwire/react`, `@ghostwire/node`, Python
  `ghostwire-analytics`). Next.js sites can serve the tracker from their own domain with
  `withGhostwire` so ad blockers don't drop it. Sites behind ghostwire-proxy can get the tracker
  without code changes: paste the snippet from **Settings → Tracking code → Add it through
  ghostwire-proxy** into the proxy host's Advanced config.
- **Email** (optional): `SMTP_URL` and `SMTP_FROM` turn on email alert channels and the weekly or
  monthly reports people choose under Settings → Notifications. `APP_URL` sets the links in them.
- **App and push notifications**: on https, Ghostwire Analytics installs as an app (Install app
  in Chrome, Edge and Android; Share → Add to Home Screen on iPhone and iPad). Under **Settings →
  Notifications → This device**, turn on notifications on each phone or computer; that adds a
  "My devices" push channel to pick in each website's alert settings. A team push channel reaches
  every member's devices. Nothing to configure: the keys are generated on first use.
- **Single sign-on** (optional): `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` and
  `OIDC_NAME` add a "Sign in with …" button for any OpenID Connect provider (Authentik, Keycloak,
  Entra ID). Existing users sign in when the provider's verified email matches theirs;
  `OIDC_AUTO_CREATE=true` also creates accounts for new people.
- **Backups**: `docker compose --profile backup up -d` writes a daily `pg_dump` to `./backups`
  and keeps `BACKUP_KEEP_DAYS` (default 14). Restore one into the running database with
  `docker compose exec -T db pg_restore -U ghostwire -d ghostwire_analytics --clean < backups/<file>.dump`.
- **Retention** (optional): `DATA_RETENTION_DAYS=90` deletes replay, heatmap and error data
  older than 90 days, every 6 hours. `REPLAY_`, `HEATMAP_` and `ERROR_RETENTION_DAYS` override it
  per kind. Saved replays are kept, and page views and events are never deleted. Unset, nothing
  is deleted.
- **Rate limits**: tracking calls are capped per visitor IP (600 a minute, replays 240) and error
  reports per website (600 a minute). Counters are in memory; with more than one app container,
  set `RATE_LIMIT_STORE=postgres` so they're shared.
- **At scale**: the reports query raw events with Umami's indexes. At around 200,000 events a
  30-day overview takes about 50 ms. Past tens of millions of events, look at partitioning
  `website_event` by month and a retention policy for old events before adding hardware.

## Develop

```bash
docker compose up -d db           # PostgreSQL on localhost:5436
cp .env.example .env.local        # set BETTER_AUTH_SECRET
npm install
npm run db:migrate
npm run dev                       # http://localhost:3000
```

See [AGENTS.md](AGENTS.md) for architecture and conventions, and [PLAN.md](PLAN.md) for the roadmap.

## License

MIT. Includes code derived from Umami, Copyright (c) 2022 Umami Software, Inc. See [LICENSE](LICENSE).
