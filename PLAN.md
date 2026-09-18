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

## Phase 1 — Core analytics

- [x] Port `checkAuth` / `parseRequest` onto Better Auth sessions + API keys + share tokens
- [x] Port server libs (`lib/`, `queries/`, `permissions/`) and API routes, Postgres path only, with their tests (617 passing)
- [x] Tracker script (`script.js`, global `ghostwire`, `data-ghostwire-event`) + collect endpoint, verified cross-origin
- [ ] GeoIP (MaxMind GeoLite2) build step
- [ ] Websites: list, create, edit, delete, reset, transfer, tracking code
- [ ] Website overview: stats bar, pageviews/visitors chart, metrics tables (pages, referrers, browsers,
      OS, devices, countries, regions, cities, languages, screens, events, hostnames, channels), world map
- [ ] Filters, date range picker, comparison

## Phase 2 — Traffic

- [ ] Events (+ event properties), Sessions (+ session detail, activity, properties), Realtime
- [ ] Performance (web vitals), Compare, Breakdown

## Phase 3 — Behavior, audience, growth

- [ ] Goals, Funnels, Journeys, Retention
- [ ] Segments, Cohorts
- [ ] UTM, Revenue, Attribution
- [ ] Annotations

## Phase 4 — Replays and heatmaps

Umami already has both (rrweb recorder, `heatmap_event` table with clicks and scroll depth). Port them, then
extend with the original Ghostwire ideas:

- [ ] Session replay: recorder script, `/api/record`, replay list/player, saved replays
- [ ] Heatmaps: click + scroll collection, viewer
- [ ] Extensions: rage/dead click detection, breakpoint filter (mobile < 768, tablet < 1024, desktop),
      live-page iframe overlay with a `postMessage` handshake from the tracker

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
