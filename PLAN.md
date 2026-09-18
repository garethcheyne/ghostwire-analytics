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

## Phase 5 — Workspace features

- [ ] Dashboard, Boards (create, design, share); restore `src/lib/boards.test.ts` from reference with the board component registry
- [ ] Links (short links, `/q/:slug`) and Pixels (`/p/:slug`)
- [ ] Share pages (`/share/:slug`)
- [ ] Teams: create, join by access code, members and roles
- [ ] Settings: preferences, profile, security (password, 2FA), API keys
- [ ] Admin: users, websites, teams, security (enforce 2FA)
- [ ] Data export

## Phase 6 — `@ghostwire/next` package

- [ ] `<Analytics siteId host />` client component that injects the tracker script
- [ ] Track App Router navigations (`usePathname`, `useSearchParams`)
- [ ] `track(event, data)` helper with types
- [ ] First-party proxy helper for Next rewrites (`/_gw/*` → platform) to avoid ad blockers
- [ ] Build with tsup (ESM + CJS + types), target under 5 kB; test in one real project, then publish

## Phase 7 — Hardening

- [ ] Rate limiting on the ingest routes
- [ ] Retention job for raw heatmap/replay data (e.g. keep 90 days)
- [ ] Postgres backups (Proxmox backup job or `pg_dump` cron)
- [ ] Reverse proxy and TLS via ghostwire-proxy
- [ ] Periodically review Umami releases (`git -C reference/umami pull`) for fixes worth porting

---

## Open questions

- Monorepo (app + `packages/next`) or separate repo for the client package?
- Keep a fully private instance, or eventually offer hosted Ghostwire Analytics to others?
- Single sign-on across the Ghostwire suite later?
