# Ghostwire Analytics — Plan

Self-hosted, privacy-first analytics platform for all my Next.js projects, part of the Ghostwire suite.
Our own app, built fresh on Next.js 16 + shadcn with the ghostwire-proxy theme. Umami (MIT) is the
working reference for features and server logic (`reference/umami/`, see AGENTS.md).

## Decisions

- **Approach:** new app. Port Umami's proven server logic; build all UI new with shadcn.
- **Model:** central platform. Each project runs a thin client that sends events to it.
- **Client:** `@ghostwire/next` npm package with an `<Analytics />` component.
- **Hosting:** Proxmox home lab, Docker Compose (app + PostgreSQL). No Podman, Vercel, Netlify.
- **Database:** PostgreSQL only (no ClickHouse/Kafka).
- **Auth:** Better Auth (username login, roles, teams as organizations, 2FA, API keys).
- **Language:** English only.
- **License:** MIT, keeping Umami's copyright notice for derived code. Don't use the Umami name or logo.

---

## Phase 0 — Foundation ✅

- [x] Umami cloned to `reference/umami` (gitignored); fresh repo history
- [x] Next.js 16.3, React 19.3, TypeScript 6, Tailwind v4, shadcn (Radix), proxy theme
- [x] Prisma 7 schema: Umami analytics models + Better Auth models, first migration
- [x] Better Auth: username login, 2FA step, admin roles, teams, API keys
- [x] App shell: proxy-style sidebar (contextual nav, team switcher), header, theme toggle, user menu
- [x] Branded split-screen login
- [x] Docker: Dockerfile (standalone), compose (app :8770 + Postgres), migrate on start, first admin on start

## Phase 1 — Core analytics ✅

- [x] Port `checkAuth` / `parseRequest` onto Better Auth sessions + API keys + share tokens
- [x] Port server libs (`lib/`, `queries/`, `permissions/`) and API routes, Postgres path only, with their tests (617 passing)
- [x] Tracker script (`script.js`, global `ghostwire`, `data-ghostwire-event`) + collect endpoint, verified cross-origin
- [x] GeoIP (MaxMind GeoLite2) build step, bundled into the Docker image
- [x] Websites: list (search, sparklines), create, settings (details, tracking code, replays/heatmaps, sharing, reset, delete, transfer)
- [x] Website overview: stats bar with change, traffic chart, metric tables (pages/entry/exit/titles,
      referrers/channels, browsers/OS/devices, countries/regions/cities/languages, events), world map
- [x] Date range picker (presets, custom, all time, prev/next) and click-to-filter with filter badges

## Phase 2 — Traffic ✅

- [x] Events (+ event properties), Sessions (+ session detail, activity, properties), Realtime
- [x] Performance (web vitals), Compare, Breakdown

## Phase 3 — Behavior, audience, growth ✅

- [x] Goals, Funnels, Journeys, Retention
- [x] Segments, Cohorts
- [x] UTM, Revenue, Attribution
- [x] Annotations

## Phase 4 — Replays and heatmaps ✅

Umami already has both (rrweb recorder, `heatmap_event` table with clicks and scroll depth). Port them, then
extend with the original Ghostwire ideas:

- [x] Session replay: recorder script, `/api/record`, replay list/player (with visit timeline), saved replays
- [x] Heatmaps: click + scroll collection, viewer over the live page
- [x] Extensions: rage/dead click detection, breakpoint grouping (mobile < 768, tablet < 1024, desktop),
      live-page iframe overlay with a `postMessage` handshake from the tracker

## Phase 4b — Identified users and error reporting ✅

- [x] Users: sites pass the logged-in username (`ghostwire.identify` / `data-distinct-id`); support looks
      people up by username, email or name and sees every visit, error and replay
- [x] Error reporting (Raygun-style), opt-in per site (`data-errors="true"` + a switch in settings):
      grouping by fingerprint, Open/Resolved/Ignored with regression detection, stack traces for
      JavaScript, Node, Python and .NET, breadcrumbs, replay at the moment of the error
- [x] Server ingest (`POST /api/errors`) with per-website ingest keys
- [x] Capture only observes: never cancels, wraps or rethrows a site's errors
- [x] Client libraries in `packages/`: `@ghostwire/react`, `@ghostwire/node` (Python next)

## Phase 5 — Workspace features ✅

- [x] Dashboard (starter layout from your websites until customised) and Boards: create, design
      (rows of up to 3 widgets: stats, charts, tables, map, goals, funnels, text), share read-only
- [x] Links (short links, `/q/:slug`) and Pixels (`/p/:slug`)
- [x] Share pages (`/share/:slug`) for websites and boards; share links never reveal identified users
- [x] Teams: create, join by access code, members and roles
- [x] Settings: preferences, profile, security (password, 2FA), API keys
- [x] Admin: users, websites, teams, security (enforce 2FA)
- [x] Data export (CSV zip for the current date range and filters)

## Phase 6 — Next.js integration ✅

Folded into the client libraries rather than a separate `@ghostwire/next`:

- [x] `<GhostwireProvider host websiteId />` (`@ghostwire/react`) injects the tracker script
- [x] App Router navigations are tracked by the tracker's `history` hooks (verified with `next/link`)
- [x] `track(event, data)`, `identify`, `reportError` helpers with types
- [x] First-party proxy: `withGhostwire(nextConfig, { host })` from `@ghostwire/node/next` rewrites
      `/_gw/*` (tracker, recorder, ingest only) to the platform; verified in a real Next 16 app
- [x] Built with tsup (ESM + CJS + types); `@ghostwire/react` is ~4 kB
- [ ] Publish to npm (when you're ready)

## Phase 7 — Hardening ✅

- [x] Rate limiting on the ingest routes (per IP for tracking/replays, per website for errors)
- [x] Retention job for raw replay/heatmap/error data (`DATA_RETENTION_DAYS`, off unless set)
- [x] Postgres backups: `docker compose --profile backup up -d` (daily `pg_dump`, rotated)
- [x] Reverse proxy and TLS via ghostwire-proxy (documented; its `X-Real-IP` gives visitor locations)
- [ ] Periodically review Umami releases (`git -C reference/umami pull`) for fixes worth porting

## Phase 8 — Operations and support ✅

- [x] Alerts: Slack, Discord, Telegram, signed webhook and email channels (personal or team); new error, regression,
      error spike and traffic drop rules per website, with delivery history
- [x] Release tracking: `data-release`/`release`, crash-free sessions, new and regressed errors per release,
      deploy markers on the traffic chart, deploy API
- [x] Source maps: upload API and `ghostwire` CLI, stack frames mapped to original files with code context
- [x] Replay privacy: markup opt-outs (`gw-block`, `gw-mask`, `gw-ignore`), masked selectors, hidden media,
      recording paused on chosen pages
- [x] Support: copy-for-ticket summaries and expiring read-only support links (optionally with replays)
- [x] Forget a user (data-protection erasure), audit log of sign-ins, security and admin actions
- [x] Weekly and monthly email reports
- [x] Python client (`packages/python`): exceptions, crashes, ASGI/WSGI middleware, logging, releases
- [x] Single sign-on with any OpenID Connect provider
- [x] Tracker injection through ghostwire-proxy (generated OpenResty snippet for a host's Advanced config)
- [x] Shared rate limits (`RATE_LIMIT_STORE=postgres`) for more than one app container
- [x] Installable app (PWA) with push notifications as an alert channel, per device
- [x] One-command installer and uninstaller (`scripts/install.sh`, `scripts/uninstall.sh`)
- [ ] Native "inject tracker" switch in ghostwire-proxy itself (a change in that repo)
- [ ] Partitioning or rollups for `website_event`, once there are tens of millions of events

---

## Open questions

- Keep a fully private instance, or eventually offer hosted Ghostwire Analytics to others?
- Single sign-on across the Ghostwire suite later?
