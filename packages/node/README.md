# @ghostwire/node

Server-side error reporting for [Ghostwire Analytics](https://github.com/garethcheyne/ghostwire-analytics):
Node, Express and Next.js.

```bash
npm install @ghostwire/node
```

Errors are grouped with your browser errors under **Errors** in Ghostwire. Errors with a `user`
also show on that user's page, next to their visits and replays.

It **only observes**. It never catches, swallows or rethrows your errors, and it never changes
whether your process exits. Reporting itself never throws or rejects, and gives up after 3 seconds.

## Set up

Create an ingest key in the website's settings (**Settings → Errors → Server errors**), and keep
it secret.

```ts
import { init } from '@ghostwire/node';

init({
  host: 'https://analytics.example.com',
  websiteId: '7d3ecc49-7e12-4672-b092-685c96d2a6d4',
  key: process.env.GHOSTWIRE_ERROR_KEY,
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
});
```

Or skip `init()` and set `GHOSTWIRE_HOST`, `GHOSTWIRE_WEBSITE_ID` and `GHOSTWIRE_ERROR_KEY`
(optionally `GHOSTWIRE_ENVIRONMENT` and `GHOSTWIRE_RELEASE`).

### Crashes

`init()` reports uncaught exceptions and unhandled rejections using Node's
`uncaughtExceptionMonitor`. That hook watches without handling, so the process still crashes
and exits exactly as it would have. The report is sent synchronously just before exit. Turn it
off with `captureUncaught: false`.

### Express

After your routes. It reports, then passes the error on unchanged to your own error handler (or
Express's default):

```ts
import { errorHandler } from '@ghostwire/node';

app.use(errorHandler());
```

### Next.js (15+)

Errors from server components, route handlers, server actions and middleware:

```ts
// instrumentation.ts
export { onRequestError } from '@ghostwire/node/next';
```

Configure it with the environment variables above, or call `init()` in `register()`.

#### Serve the tracker from your own domain

Ad blockers often block requests to analytics hosts. `withGhostwire` adds rewrites so the
tracker, the replay recorder and their ingest endpoints are served from `/_gw` on your site
(first-party). Nothing else on your Ghostwire server is reachable through it.

```ts
// next.config.ts
import { withGhostwire } from '@ghostwire/node/next';

export default withGhostwire(nextConfig, { host: 'https://analytics.example.com' });
```

Then point the tracker at the path: `<GhostwireProvider host="/_gw" ... />` from
`@ghostwire/react`, or `<script defer src="/_gw/script.js" data-website-id="..."></script>`.

- Your own rewrites are kept. Options: `path` (default `/_gw`), `scriptName`.
- If your `proxy.ts` (middleware) protects every path, exclude `/_gw` from its matcher.
- Visitor locations come from the `X-Forwarded-For` header. Vercel and reverse proxies set it;
  if your Next server faces the internet directly, every visit looks like it came from itself.

### Errors you handle

```ts
import { captureException } from '@ghostwire/node';

try {
  await chargeCard(order);
} catch (error) {
  captureException(error, {
    user: { id: user.username, email: user.email },
    request: req,
    tags: { feature: 'checkout' },
    extra: { orderId: order.id },
  });
  throw error; // your own handling carries on
}
```

`request` accepts Express/Node requests, Fetch API requests, or `{ method, url, userAgent }`.
Query strings are removed before sending, as they often carry tokens.

### Scrubbing

```ts
init({
  // ...
  beforeSend(report) {
    if (report.error.message.includes('password')) return null; // drop it
    return report;
  },
});
```

## Other languages

Any server can send errors over HTTP. Python and .NET stack traces are parsed automatically:

```bash
curl -X POST https://analytics.example.com/api/errors \
  -H "Authorization: Bearer $GHOSTWIRE_ERROR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"website":"<website id>","platform":"python","error":{"type":"KeyError","message":"...","stack":"..."}}'
```

## Develop

```bash
npm install
npm test
npm run build
```
