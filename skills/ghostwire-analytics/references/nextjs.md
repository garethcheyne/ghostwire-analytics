# Next.js (App Router)

The pattern below is what survives contact with a real Next app: static
prerendering, a CSP, Docker, and an existing analytics or APM integration.

## The tracker

Render the script tags from a **server component** placed in the root layout's
`<head>`. Do not reach for `next/script`.

`next/script` is a client component. Rendering one with
`strategy="beforeInteractive"` from inside another component makes React warn
on every page — *"Encountered a script tag while rendering React component.
Scripts inside React components are never executed when rendering on the
client"* — and the client copy does nothing but produce the warning. Plain
`<script>` tags in a server component go out in the initial HTML and run before
hydration, which is what lets the tracker catch errors thrown while the app is
still loading.

```tsx
// src/components/ghostwire-analytics.tsx  (no "use client")
export function GhostwireAnalytics() {
  const host = process.env.GHOSTWIRE_HOST?.replace(/\/+$/, '');
  const websiteId = process.env.GHOSTWIRE_WEBSITE_ID;
  const release = process.env.GHOSTWIRE_RELEASE;

  // Renders nothing when unconfigured, so a developer without the values set
  // sends nothing.
  if (!host || !websiteId) return null;

  return (
    <>
      <script
        defer
        src={`${host}/script.js`}
        data-website-id={websiteId}
        data-host-url={host}
        data-errors="true"
        data-performance="true"
        {...(release && { 'data-release': release })}
      />
      {/* Only if session replay and heatmaps are wanted. The recorder asks the
          server whether it is enabled before recording, so the tag is harmless
          while the feature is off. */}
      <script defer src={`${host}/recorder.js`} data-website-id={websiteId} data-host-url={host} />
    </>
  );
}
```

```tsx
// src/app/layout.tsx
<html lang="en">
  <head>
    <GhostwireAnalytics />
  </head>
  <body>{children}</body>
</html>
```

The tracker hooks `history.pushState` itself, so App Router navigations are
counted with no extra work. Do not add a `usePathname` effect that calls
`track()` on every route change — it double-counts.

## Environment, and the trap that eats it

Use **non-public** variables (`GHOSTWIRE_HOST`, not `NEXT_PUBLIC_…`). The
component is a server component, so it reads them at render time and the values
stay out of the client bundle.

The trap: **any route Next prerenders at build time renders this layout during
the build.** If the values are only present at runtime, those pages are built
with `null` and never report — while dynamic routes work fine, which makes the
bug look like a partial outage rather than a configuration error.

In Docker that means build arguments *as well as* runtime environment:

```dockerfile
ARG GHOSTWIRE_HOST
ENV GHOSTWIRE_HOST=$GHOSTWIRE_HOST
ARG GHOSTWIRE_WEBSITE_ID
ENV GHOSTWIRE_WEBSITE_ID=$GHOSTWIRE_WEBSITE_ID
```

```yaml
services:
  app:
    build:
      args:
        - GHOSTWIRE_HOST=${GHOSTWIRE_HOST}
        - GHOSTWIRE_WEBSITE_ID=${GHOSTWIRE_WEBSITE_ID}
    environment:
      - GHOSTWIRE_HOST=${GHOSTWIRE_HOST}
      - GHOSTWIRE_WEBSITE_ID=${GHOSTWIRE_WEBSITE_ID}
      - GHOSTWIRE_ERROR_KEY=${GHOSTWIRE_ERROR_KEY}   # server only, secret
```

Check `.dockerignore`: if it excludes `.env` (it usually should), the build
cannot read those values any other way.

Put `GHOSTWIRE_WEBSITE_ID=` (empty) in `.env.local` so development traffic
stays out of the production figures.

## Content-Security-Policy

If the app sets a CSP, add the Ghostwire host to `script-src` **and**
`connect-src`. Missing `connect-src` loads the tracker and silently blocks
every page view.

In Next 16 the CSP usually lives in `src/proxy.ts` (previously `middleware.ts`)
or in `headers()` in `next.config.ts`. **Middleware inlines environment
variables at build time**, so a runtime-only `process.env.GHOSTWIRE_HOST`
resolves to `undefined` there and silently drops the host from the policy.
Write the host literally in the CSP and leave a comment tying it to the
environment variable.

## Identifying the signed-in user

Only when asked for. Prefer the email as the ID: it is what support searches
on, and it keeps one person recognisable across several apps that have
different internal user IDs.

```tsx
'use client';
export function GhostwireIdentify() {
  const { data: session, status } = useSession();   // or your auth hook

  useEffect(() => {
    // Not while the session is still loading, or the visitor is signed out of
    // Ghostwire on every page load.
    if (status === 'loading') return;

    const w = window as any;
    if (!w.ghostwire) return;                        // tracker not loaded yet

    const id = session?.user?.email || session?.user?.id;
    w.ghostwire.identify(id ?? null, id ? { email: session.user.email } : undefined);
  }, [status, session]);

  return null;
}
```

The tracker is loaded with `defer`, so it may not exist on the first run.
Retry on a short interval for a few seconds and then give up — a missing
identity is not worth a timer that runs for the life of the page.

Mount it inside the session provider.

## Server-side errors

`instrumentation.ts` has the hook. Report alongside whatever the app already
does; never replace its handling.

```ts
export async function onRequestError(error: unknown, request: any, context: any) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { captureException } = await import('@/lib/ghostwire');
  await captureException(error, {
    handled: false,
    request,
    tags: { routePath: context.routePath },
  });
}
```

See `server.md` for `captureException` and the `gwe_` ingest key.

## Verify

```bash
curl -s https://yoursite.example/ | grep ghostwire          # a static route
curl -s -I https://yoursite.example/ | grep -i content-security
```

If the tag is missing from a static route but present on a dynamic one, the
build-time environment is the cause.
