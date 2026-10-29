# Agent Context - Ghostwire Analytics

## Project Overview
Self-hosted, privacy-first web analytics for the Ghostwire suite and the owner's Next.js projects.
It is our own app, built fresh. [Umami](https://github.com/umami-software/umami) (MIT) is the working
reference and baseline for features, data model and server logic. See [PLAN.md](PLAN.md).

## Reference: Umami (`reference/umami/`)
- A plain clone of upstream Umami, **gitignored**. If missing:
  `git clone https://github.com/umami-software/umami.git reference/umami`. Refresh with `git -C reference/umami pull`.
- Read it for guidance; never import from it or edit it.
- **Server side** (API routes, `src/queries`, `src/lib`, `src/permissions`, tracker, recorder): port the logic,
  adapted to the decisions below. It is proven and tested; don't reinvent its SQL.
- **UI**: build new with shadcn. Use Umami's pages to learn *what* a screen shows, not *how* it's built.
  Never bring back `@umami/react-zen` or its `Row`/`Column`/`Text` layout API.
- Umami's MIT copyright notice must stay in `LICENSE` for ported code.

## Ghostwire Suite (sibling repos)
Read at any time for conventions, theming, Docker setup and branding. Treat as read-only.

| Repo | Path | What it is |
|------|------|------------|
| Ghostwire Secure | `C:\Apps\Projects\WebSites\ghostwire-suite\ghostwire-secure` | Security monitoring suite (Next.js + FastAPI + PostgreSQL). See its `CLAUDE.md`, `DESIGN_SYSTEM.md`. |
| Ghostwire Proxy | `C:\Apps\Projects\WebSites\ghostwire-suite\ghostwire-proxy` | Reverse proxy manager (OpenResty + Next.js + FastAPI). Source of our theme and app-shell look. |

## Tech Stack
| Layer | Tech |
|-------|------|
| App | Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript 6 |
| UI | Tailwind CSS v4, shadcn/ui (Radix base, `radix-nova` style), lucide-react, next-themes (dark default) |
| Data | PostgreSQL 17, Prisma 7 (`prisma-client` generator → `src/generated/prisma`, `@prisma/adapter-pg`) |
| Auth | Better Auth 1.7: username, admin, organization (teams), twoFactor, `@better-auth/api-key` |
| Client data | TanStack Query |
| Package manager | pnpm 10 (pinned via `packageManager`; each `packages/*` client has its own lockfile, no workspace) |

TypeScript is held at 6.0.3 exactly (below 6.1 until typescript-eslint supports it), ESLint at 9 and Prisma at 7: see the
suite's `CONVENTIONS.md` for the versions every Ghostwire app shares.
Dependency build scripts are allow-listed in `pnpm.onlyBuiltDependencies` in package.json (pnpm 10 skips any that
are not listed); add a package there if an install warns about ignored build scripts.

## Theming and UI rules
- The look comes from the suite's `@ghostwire` shadcn registry (`../ui/README.md`, rules in `../design/README.md`):
  the theme `src/styles/ghostwire.css` (imported by `src/app/globals.css`, which holds only this app's additions),
  `src/components/ui/*`, `src/components/app-shell/*`, `page-header.tsx`, `stat-card.tsx`, `hooks/use-mobile.ts`.
  These are copies: never edit them here. Change the registry and re-add the item (`shadcn add @ghostwire/<item> --overwrite`).
- Every dashboard page starts with `PageHeader`; summary numbers are `StatCard`s; buttons are `Button` variants only;
  no gradients, glows or hover lift (design guide, "Decoration: none"). A failed query shows `QueryError`
  (`src/components/query-error.tsx`), not the empty state.
- Follow the shadcn skill rules: semantic colours, `gap-*` not `space-*`, `size-*`, `FieldGroup`/`Field` for forms,
  `Empty`, `Skeleton`, `Alert`, `sonner` toasts, `data-icon` on button icons.
- Class merging is `cn` from `@/lib/utils` (clsx + tailwind-merge). After a `shadcn add`, repoint any
  `from "cn"` import to `@/lib/utils` (see the registry README).
- English only; strings are written inline (no i18n layer).

## Architecture decisions
- **PostgreSQL only.** Umami's ClickHouse/Kafka branches are dropped when porting (take the Prisma/SQL path).
- **Schema** (`prisma/schema.prisma`): Umami's analytics models + Better Auth's models, `relationMode = "prisma"`
  (no DB foreign keys), as in Umami.
- **Auth mapping**: Umami `user` → Better Auth `user` (+ `username`, `role`: admin/user/viewer).
  Umami teams → Better Auth organizations (roles owner/manager/member/viewer in `src/lib/auth-roles.ts`);
  `teamId` columns reference `organization.id`. Login sessions are `AuthSession` (table `auth_session`) because
  `session` is Umami's visitor-session table. IDs are UUIDs (`advanced.database.generateId: 'uuid'`).
- **Team context** is the session's active organization (team switcher in the sidebar), not Umami's `/teams/:id` URLs.
- **API auth**: ported routes go through one `checkAuth(request)` (`src/lib/auth.ts`) that accepts the Better Auth
  session cookie, `Authorization: Bearer gwa_...` API keys, or share tokens. Keep that single entry point.
  Better Auth is configured in `src/lib/better-auth.ts` and imported lazily from server code, so modules that only
  need `hasPermission` (and their tests, which mock `@/lib/prisma`) don't boot it.
- **Ported code conventions**: Umami's `ROLES` constants hold our role names. The Umami Cloud (`CLOUD_MODE`), Redis
  and soft-deleted user/team paths are removed. `@/lib/prisma`'s default export is Umami's helper object
  (`prisma.client`, `rawQuery`, `pagedQuery`...); its named `prisma` export is the bare client.
- **Strictness**: `strict` with `noImplicitAny: false` (as in Umami). `strictNullChecks` stays on because Better
  Auth's types need it. ESLint allows explicit `any` for the same reason.
- **Identified users**: tracked sites pass their username with `ghostwire.identify(id, data)` or
  `data-distinct-id`. Identifying starts a separate session (the ID is part of the session hash), so
  `/api/send` links both that session and the browser's anonymous session to the user in `session_link`.
  The Users pages (`src/queries/sql/users`) read everything through `session_link`.
- **Error reporting**: `error_group` (one row per fingerprint) and `error_event` (occurrences). Browser errors
  arrive through `/api/send` (type `error`); servers post to `/api/errors` with a per-website ingest key
  (`gwe_…`, stored as a SHA-256 hash; Prisma omits `errorKeyHash` from website queries by default). Both need
  `website.errorsEnabled`. Grouping, stack parsing and noise filtering live in `src/lib/errors.ts`.
  **Capture must only observe**: never cancel, wrap or rethrow a site's errors, and never throw from capture code
  (tracker, recorder and client libraries alike).
- **Client libraries** live in `packages/<name>`: `react`, `node` (also the `ghostwire` CLI for releases and source
  maps, and `withGhostwire` for Next) and `python` (`ghostwire-analytics`, stdlib only). Each is self-contained
  (own manifest, tests), excluded from the app's tsconfig, tests and Docker image. JS: `pnpm install && pnpm test &&
  pnpm build` inside the package; Python: `python -m unittest discover -s tests`.
- **Heatmap viewer frame**: the viewer loads the live page in an iframe named `ghostwire-heatmap`. There the
  tracker and recorder send nothing (so previews aren't counted as visits); the tracker instead posts
  `{ type: 'ghostwire:heatmap-frame', width, height }` to the parent so the viewer can size the preview.
- **Heatmap event types**: click 1, scroll 2, dead click 3 (recorded by the recorder alongside the click).
  Rage clicks aren't stored; they're computed from click timestamps in `getHeatmap`.
- **Share links and identified users**: requests authenticated only by a share token (`auth.user` null), and
  read-only (website-read) API keys, never see distinct IDs or identify traits. `parseRequest` drops `distinctId`
  filters and refuses `type=distinctId` and a breakdown on `distinctId`; session detail, session properties and
  session search hide them. Keep this for any new endpoint that returns user identities, and put users, replays,
  errors, heatmaps and session data (`session-data/*`, the identify traits) behind `canViewAuthenticatedWebsite`.
- **Values written into SQL text** (column names, LIMIT/OFFSET, date units, time zones) go through
  `src/lib/sql-safe.ts` (`metricColumn`, `sqlInteger`, `sqlTimezone`) even when a route already validated them.
  MCP tools declare a Zod shape that is enforced on every call (`finish()` in `src/lib/mcp/tools.ts`).
- **Boards**: widget metadata in `src/lib/board-components.ts` (Umami's type names), renderers in
  `src/components/boards/widgets.tsx`. The personal dashboard is a board-shaped `parameters` object saved via
  `/api/dashboard`. Board share responses include `names` for the widgets' entities (viewers can't list them).
- **Ingest limits** (`src/lib/rate-limit.ts`): `/api/send` 600/min and `/api/record` 240/min per IP (no IP, no
  limit); errors 600/min per website and 20/min per session. In memory, or shared through the `rate_limit` table
  with `RATE_LIMIT_STORE=postgres` (fails open). Use `createLimiter`/`createIpRateLimiter` (async) in routes.
  Body sizes (`src/lib/body-limit.ts`, checked before parsing, chunked uploads read only up to the limit):
  `/api/send` 128 KB, `/api/batch` 5 MB, `/api/errors` 256 KB, `/api/record` 1 MB, `/v1/*` 10 MB.
- **Alerts** (`src/lib/alerts.ts`, delivery in `src/lib/notify.ts`): channels (`notification_channel`, per user or
  team: email via SMTP_URL, Slack, Discord, Telegram, signed webhooks; secrets and bot tokens in config.secret) and one `alert_rule` per type per website.
  `error.new`/`error.regression` fire from the ingest routes via `afterResponse()` (Next `after`), using the
  `isNew`/`regressed` flags `saveError` returns; `error.spike`/`traffic.drop` run every 5 minutes. Rules are
  claimed through `last_triggered_at` so several containers don't double-send. Deliveries go to `alert_log`.
- **PWA and push** (`src/app/manifest.ts`, `public/sw.js`, browser side `src/lib/pwa.ts`, server `src/lib/push.ts`):
  installable app; the service worker caches only `/_next/static` and icons (not in dev: registered as
  `sw.js?dev=1`), shows push notifications and opens their URL on click. Caching failures must never stop it
  installing. Devices are `push_subscription` rows (one per endpoint); VAPID keys come from `VAPID_*` or are
  generated into `app_setting` (`vapid_keys`). The `push` channel type reaches its owner's devices, or every team
  member's for a team channel; expired endpoints (404/410) are deleted. Push needs https (or localhost), and on
  iOS the app added to the Home Screen.
- **Releases and source maps**: the tracker's `data-release` (and the client libraries' `release`) lands on
  `website_event.release`, `error_event.release` and `error_group.first_/last_/regressed_release`; `release` rows
  are recorded throttled (`src/lib/releases.ts`) or registered by deploys. Source maps (`source_map`, gzip, keyed
  by release + minified URL path) are applied at ingest (`resolveFrames`) and again when viewing older errors.
  A frame's function name comes from the *caller's* call site (the name a map gives a position is the callee's).
  CI endpoints accept the website's server key (`gwe_…`) through `authorizeWebsiteWrite` (`src/lib/website-key.ts`).
- **Support links** (`support_link`): expiring public pages at `/support/<slug>` with one identified user's
  timeline, served by `/api/support/<slug>` (replays only when the link includes them, and only that user's).
  `UserDetailView` renders both the app page and the support page; links come from a `UserLinks` context.
- **Forget a user**: `forgetUser()` deletes every session linked to the distinct ID (via `deleteSession`), their
  server errors and support links. Needs `canDeleteWebsite`; audited as `user.forget`.
- **Audit log** (`audit_log`, `src/lib/audit.ts`): `audit(request, auth, entry)` in routes for security and admin
  actions; Better Auth activity (sign-ins incl. failures and SSO, 2FA, passwords, API keys, admin and team
  endpoints) is recorded by the `hooks.after` middleware in `better-auth.ts`. Secrets are redacted by key name.
  Admin-only page at `/admin/audit`. Route tests that load `@/lib/audit` must mock it (it imports Prisma).
- **Email reports** (`email_report`, `src/lib/email-reports.ts`): weekly (Mondays) or monthly (the 1st) after
  07:00 UTC, checked hourly and claimed via `last_sent_at`. Periods use UTC arithmetic (date-fns would shift
  across daylight saving).
- **Single sign-on** (`src/lib/sso.ts`): Better Auth `genericOAuth` provider `oidc` when `OIDC_DISCOVERY_URL` and
  `OIDC_CLIENT_ID` are set. Existing users link by email only when the provider marks it verified
  (`requireLocalEmailVerified: false`, provider not "trusted"); new users only with `OIDC_AUTO_CREATE=true`.
- **Retention** (`src/lib/retention.ts`, scheduled from instrumentation): off unless `DATA_RETENTION_DAYS` (or the
  per-kind `REPLAY_`/`HEATMAP_`/`ERROR_RETENTION_DAYS`) is set. Never deletes page views, events or saved replays.
- **Logging** (`src/lib/logger.ts`, `src/lib/metrics.ts`): server code logs through `log.info/warn/error(event,
  fields)` (JSON lines to stdout and daily files in `LOG_DIR`; errors are serialized with their stack), never
  `console`. Per-request outcomes go to counters (`count('send.dropped.bot')`), flushed as one `stats` line every
  `STATS_INTERVAL_MINUTES` (5). Next.js loads a separate copy of a module per bundle (each route handler, the
  instrumentation), so process-wide state such as counters and the log file handle lives on `globalThis`.
  Next's own server errors are logged by `onRequestError` in `src/instrumentation.ts`. In Docker the logs are in
  the `app-logs` volume (`/app/logs`); inspect with `docker compose exec app sh -c 'tail /app/logs/app-*.log'`.
  `/api/health` checks the database (503 when it's down); `/api/heartbeat` is the container liveness check.
- **System monitoring** (OpenTelemetry; spec `ghostwire-suite/docs/analytics-reporting.md`):
  - *Ingest* `POST /v1/metrics`, `/v1/traces` (`src/app/v1/*` → `src/lib/otlp/http.ts`, public in
    `src/proxy.ts`): protobuf (decoded with protobufjs against `src/lib/otlp/otlp-proto.json`, built
    from the vendored opentelemetry-proto by `scripts/build-otlp-proto.mjs`) or JSON, gzip/deflate.
    The `gwe_` key finds the website by `error_key_hash` (indexed); monitoring doesn't need
    `errorsEnabled`. 10 MB body, 40 MB decompressed, 1200 requests/min per site, 20,000 points and
    10,000 spans per request. Answers are OTLP: `partial_success` for refused items, a
    google.rpc.Status body on errors, 429/503 retryable. Everything goes through `ingestSignal()`,
    which self monitoring calls in process. A request is a few batched statements
    (`jsonb_to_recordset`), never one per point.
  - *Data model*: `monitor_service` (website + `service.namespace` + `service.name`; last seen, last
    metrics, last heartbeat, learned export interval), `monitor_metric_minute` / `_hour` (one row
    per service, metric, attribute set and bucket: count, sum, min, max, last, explicit histogram
    `bounds`/`buckets`; kind 1 counter = total in the bucket, 2 gauge = readings, 3 histogram),
    `monitor_cumulative` (last running total per original stream, for deltas), `monitor_span`
    (one row per span, capped attributes and events, sanitized `db_statement`, `is_entry` for the
    trace list, `error_group_id`). SQL helpers in the migration: `monitor_array_add` and the
    aggregate `monitor_sum_buckets` (element-wise bucket sums). The three partial indexes on
    `monitor_span` are hand-written in the migration: if `migrate dev` proposes dropping them, keep them.
  - *Normalizing*: older semantic-convention names are read as current ones
    (`http.server.duration` → `http.server.request.duration`, `http.method` →
    `http.request.method`...). Duration histograms (`*.duration`) are stored in ms whatever their
    unit. Cumulative counters/histograms become deltas per stream (first point a baseline unless the
    stream started in the last 10 minutes; a new start time or a drop is a restart). Non-monotonic
    sums (memory in use) are readings. Histograms with different bounds are different series
    (`attrs_hash` covers the bounds), so stored buckets always line up; queries group by bounds and
    merge in code (`src/lib/monitoring/histograms.ts`, percentiles in `src/lib/otlp/percentile.ts`).
  - *Cardinality* (`src/lib/otlp/attributes.ts`): each metric family keeps only its listed
    attributes (http.server.*: route, method, status code, error.type; http.client.*: method,
    status, server.address, error.type; db.client.*: db.system, operation, collection,
    server.address; ghostwire.job.*: job, outcome; container.*: container.name (from the resource),
    direction, operation; system.*: host.name, state, direction, mountpoint, type). Others keep up
    to 6 attributes not matching the deny list (URLs, paths, queries, IPs, user agents, ids,
    users, sessions, tokens). Past 500 attribute sets per service and metric, new ones fold into
    `{otel.metric.overflow: true}`; past 400 metric names per site, new names are refused (both per
    process, on `globalThis`). Spans keep 64 attributes (8 KB JSON), 16 events (exceptions first),
    drop credentials and the raw statement, and strip query strings from URLs.
  - *Status* (`src/lib/monitoring/status.ts`): down after 3 learned intervals (min 2 min) without
    metrics, or without a heartbeat once one was seen; trace-only services go idle, never down.
  - *Reads*: `src/queries/sql/system/*` behind `/api/websites/[id]/system/*` (all
    `canViewAuthenticatedWebsite`), minute rollups up to 2 days, hourly beyond
    (`src/lib/monitoring/resolution.ts`). Table names and bucket sizes written into SQL are checked.
  - *Schedule* (`src/lib/monitoring/schedule.ts`): hourly rollups every 5 minutes (current and
    previous hour, caught up from the `monitor_hour_rollup` watermark); retention hourly from each
    website's `monitor_span_days` (7), `monitor_minute_days` (30), `monitor_hour_days` (396).
    Website delete/reset removes monitoring data too.
  - *Alerts* `system.*` (`src/lib/monitoring/alerts.ts`), with the 5-minute scheduled checks:
    latency, error_rate, down, job_failure, cpu, memory; one alert per cooldown (6 h for down, 1 h
    otherwise), claimed through `last_triggered_at`.
  - *Self monitoring* (`src/lib/monitoring/self.ts`, `self-telemetry.ts`): app settings
    `self_monitoring` and `self_monitoring_website_id`; the site is created once (named after the
    instance's host, error reporting on). The SDK is registered first thing in instrumentation
    (never fatal) with in-process exporters (OTLP JSON serializer → `ingestSignal`, tracing
    suppressed), Next's own request spans (they carry `http.route`; the request metric is recorded
    from them) plus undici and `@prisma/instrumentation`. The http and pg instrumentations aren't
    used: Next covers incoming requests, pg is loaded as ESM by the Prisma adapter, and
    instrumentation-http can't load in the standalone image (`forwarded-parse` isn't traced).
- **First admin** is created on startup when there are no users (`src/instrumentation.ts` → `src/lib/setup.ts`):
  username `admin`, password `ADMIN_PASSWORD` (default `ghostwire`).

## Commands
```bash
docker compose up -d db      # Postgres on localhost:5436
pnpm dev                     # http://localhost:3000 (env in .env.local, see .env.example)
pnpm db:migrate:dev          # create/apply a migration after editing the schema
pnpm typecheck               # next typegen + tsc
pnpm test                    # vitest
docker compose up -d --build # full stack on http://localhost:8770
```

## Ports
- App: 8770 (internal 3000). Dev server: 3000.
- PostgreSQL: 5436 on localhost (internal 5432).

## Database Safety Rules
- **NEVER perform destructive database operations** (DROP TABLE, DELETE without WHERE, TRUNCATE, etc.)
- **NEVER modify production data** without explicit user confirmation.
- Schema changes go through Prisma migrations.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
