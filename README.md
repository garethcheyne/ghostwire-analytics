# Ghostwire Analytics

Self-hosted, privacy-first web analytics, part of the Ghostwire suite. Cookie-free visitor
tracking, events, funnels, journeys, retention, heatmaps and session replay, on your own
PostgreSQL.

Built with Next.js 16, shadcn/ui, Prisma 7 and Better Auth. Based on
[Umami](https://github.com/umami-software/umami) (MIT).

## Run with Docker

```bash
cp .env.example .env              # then set BETTER_AUTH_SECRET (npx auth secret)
docker compose up -d --build
```

Open http://localhost:8770 and sign in as `admin` / `ghostwire` (or `ADMIN_PASSWORD` if set).
Change the password straight away.

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
