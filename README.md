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
