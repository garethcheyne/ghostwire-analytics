---
name: ghostwire-analytics
description: Add Ghostwire Analytics to a project — page views, custom events, session replay, heatmaps, identified users, error reporting and Core Web Vitals. Use this whenever someone wants to add, set up, install, wire up or debug analytics, tracking, visitor stats, session replay or front-end error reporting in their app, and whenever Ghostwire, ghostwire-analytics, GHOSTWIRE_WEBSITE_ID, script.js/recorder.js or a gwe_ ingest key comes up. Also use it when analytics were added but no data is arriving, which is usually a Content-Security-Policy or build-time environment problem rather than a bad snippet. Covers Next.js App Router, React (Vite/CRA/Remix), plain HTML, and server-side Node, Express and Python.
---

# Ghostwire Analytics

Ghostwire is self-hosted, cookie-free web analytics. A site loads a small
tracker script; the tracker posts page views and events to the Ghostwire
instance. Nothing is stored in the browser and no consent banner is needed for
the default configuration.

Integrating it is usually ten minutes of work. It goes wrong in a handful of
predictable ways, and this skill is mostly about those.

## What you need before writing any code

Two values, both from the Ghostwire instance:

| Value | Where it comes from | Secret? |
|---|---|---|
| Host | The instance URL, e.g. `https://analytics.example.com` | No |
| Website ID | Settings → the site → Tracking code. A UUID. | No |
| Error ingest key (`gwe_…`) | Settings → the site → Errors. Only for **server-side** error reporting. | **Yes** |

If the project has a Ghostwire MCP server connected, call
`ghostwire_list_websites` to find an existing site, or `ghostwire_create_website`
to make one — it returns the ID and a ready-made snippet. Otherwise ask the
user for the host and website ID; **do not invent a UUID**, because a tracker
pointed at a non-existent website fails silently and looks exactly like a
working install.

## Pick the integration

Read the one reference that matches the project. Each is self-contained.

| Project | Read |
|---|---|
| Next.js App Router | `references/nextjs.md` |
| React without Next: Vite, CRA, Remix | `references/react.md` |
| Plain HTML, WordPress, Hugo, Astro, or a reverse proxy | `references/html.md` |
| Node, Express, or Python back end | `references/server.md` |

A full-stack app usually wants two: the front-end one for page views, and
`server.md` for errors thrown on the server.

## The four things that actually go wrong

Check these before concluding an integration works. Every one of them produces
a site that looks correctly instrumented and reports nothing.

**1. Content-Security-Policy.** If the app sets a CSP — a `Content-Security-Policy`
header in middleware, `next.config`, nginx or a meta tag — the Ghostwire host
must appear in **both** `script-src` (to load the tracker) and `connect-src`
(where it posts to). Miss `connect-src` and the script loads happily while
every page view is blocked. Search the project for `Content-Security-Policy`
before you finish.

**2. Build-time versus runtime configuration.** Anywhere the host or website ID
is read while a page is being pre-rendered — a statically generated route, a
framework that inlines `NEXT_PUBLIC_*`/`VITE_*` at build — the value has to be
present **at build time**, not just when the container starts. In Docker that
means a build argument, not only an environment variable. A missing value at
build bakes the tracker out of those pages permanently, and only the dynamic
pages ever report.

**3. Tracking your own development traffic.** Set the website ID to empty in the
local environment file so development page views and development crashes stay
out of the production figures. Every integration here renders nothing when the
ID is absent.

**4. Ad blockers.** Many block requests to hosts whose path contains
`script.js` or that look like analytics. If reports matter more than
simplicity, serve the tracker from the app's own domain — see the proxy section
in `references/html.md`.

## Verifying it actually works

Do not report success on the basis that the code looks right. Check:

1. **The tag is in the served HTML** — `curl -s <url> | grep ghostwire`. For a
   framework, check a *statically rendered* page too, not just the home page.
2. **The request goes out** — load the page with the network panel open and look
   for a `POST` to `/api/send` returning 200 or 204.
3. **It arrives** — the site's Realtime view in Ghostwire should show the visit.

If step 1 fails, it is configuration (points 2 and 3 above). If step 1 passes
and step 2 fails, it is CSP or an ad blocker. If 2 passes and 3 fails, the
website ID does not match a site on that instance.

## Things worth telling the user

- **Identifying users is opt-in and has consequences.** Calling `identify()`
  attaches a person's ID to their sessions, replays and errors. It is genuinely
  useful for support, and it turns anonymous analytics into personal data. Only
  add it when the user asks, and mention their privacy notice needs to cover it.
- **Session replay records real sessions.** Inputs are masked by default, but it
  is still a recording of someone using the site. Same conversation.
- **Error capture only observes.** It never swallows, wraps or rethrows the
  app's errors — the browser still logs them and existing handlers still run.
  If you find yourself writing a `try`/`catch` around app code to report an
  error, you have gone wrong: use the reporting call inside the catch block the
  app already has.
