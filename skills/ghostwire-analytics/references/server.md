# Server-side error reporting: Node, Express, Python

The browser tracker cannot see anything that fails on the server. This adds
back-end errors to the same Ghostwire site, so a broken checkout shows up once
with both halves of the story.

## The ingest key

Server reporting authenticates with a per-site key from Settings → the site →
Errors. It looks like `gwe_…`.

**It is a secret.** Store it as `GHOSTWIRE_ERROR_KEY` in the server
environment. Never prefix it with `NEXT_PUBLIC_`/`VITE_`, never put it in a
build argument, never commit it. Anyone holding it can write errors into the
site.

Ghostwire stores only a hash, so the key is shown once. A replacement key
silently stops whatever was using the old one.

Three variables, all server-side:

```bash
GHOSTWIRE_HOST=https://analytics.example.com
GHOSTWIRE_WEBSITE_ID=your-website-uuid
GHOSTWIRE_ERROR_KEY=gwe_...
```

## The rule that matters

**Reporting only observes.** It never catches, swallows or rethrows the
application's errors, never changes whether the process exits, and never throws
itself. If adding it changes how the app behaves under failure, it is wrong.

In practice: report from inside a `catch` the app already has; never add one
just to report. For crashes, use a monitor hook rather than a handler that
suppresses the crash.

## Node and Express

Use `@ghostwire/node` where it is available:

```js
import { init, captureException } from '@ghostwire/node';

init({
  host: process.env.GHOSTWIRE_HOST,
  websiteId: process.env.GHOSTWIRE_WEBSITE_ID,
  key: process.env.GHOSTWIRE_ERROR_KEY,
  environment: process.env.NODE_ENV,
  release: process.env.GIT_SHA,
});
```

Express — report from the error middleware the app already has, and call
`next(err)` so its own handling is untouched:

```js
app.use((err, req, res, next) => {
  captureException(err, { handled: false, request: req });
  next(err);
});
```

If the package is not available, the whole client is a POST. Vendor this rather
than adding a dependency you cannot install:

```js
export async function captureException(error, context = {}) {
  try {
    const host = process.env.GHOSTWIRE_HOST;
    const websiteId = process.env.GHOSTWIRE_WEBSITE_ID;
    const key = process.env.GHOSTWIRE_ERROR_KEY;
    if (!host || !websiteId || !key) return;          // unconfigured: stay quiet

    const err = error instanceof Error ? error : new Error(String(error));

    await fetch(`${host.replace(/\/+$/, '')}/api/errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        website: websiteId,
        platform: 'node',
        error: { type: err.name, message: err.message, stack: err.stack },
        handled: context.handled ?? true,
        environment: process.env.NODE_ENV,
        release: process.env.GIT_SHA,
        tags: context.tags,
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Never let reporting break the thing it is reporting on.
  }
}
```

### Crashes

Node will not wait for a promise on the way out, so an async post from a crash
handler never arrives. Observe with `uncaughtExceptionMonitor` — which does not
suppress the crash — and send synchronously from a short-lived child process:

```js
process.on('uncaughtExceptionMonitor', (error, origin) => {
  // spawnSync a tiny node -e that POSTs the report; the process still exits
  // exactly as it would have.
});
```

`@ghostwire/node`'s `init()` does this for you. Note that
`uncaughtExceptionMonitor` does **not** fire for unhandled rejections while an
`unhandledRejection` listener is attached — if the app has one, report from
inside it too.

## Next.js

`instrumentation.ts`:

```ts
export async function onRequestError(error, request, context) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;    // the edge runtime cannot spawn
  await captureException(error, { handled: false, request, tags: { routePath: context.routePath } });
}
```

If the file already exports `onRequestError`, add the call alongside what is
there — do not replace it.

## Python

`ghostwire-analytics` on PyPI (standard library only):

```python
import ghostwire

ghostwire.init(
    host=os.environ["GHOSTWIRE_HOST"],
    website_id=os.environ["GHOSTWIRE_WEBSITE_ID"],
    key=os.environ["GHOSTWIRE_ERROR_KEY"],
)

try:
    place_order(cart)
except OrderError as exc:
    ghostwire.capture_exception(exc, tags={"feature": "checkout"})
    raise                      # the application's own handling, unchanged
```

Django — report from middleware's `process_exception` and return `None` so
Django's handling continues:

```python
def process_exception(self, request, exception):
    ghostwire.capture_exception(exception, request=request)
    return None
```

Flask — `@app.errorhandler(Exception)`, report, then re-raise or return the
app's own error response.

## Releases and source maps

Setting `release` on every report (a version or commit SHA) is what makes
"first seen in" and "regressed in" work. Set the same value on the browser
tracker's `data-release`.

Minified stacks are unreadable without maps. Build them, upload them for the
release, then stop shipping them to browsers:

```bash
npx ghostwire sourcemaps upload --dir .next/static --url-prefix /_next/static --delete
```

`--delete` removes the maps after upload so they are not served publicly.

## Verify

Cause a deliberate error on a route and check it appears under Errors in
Ghostwire. If nothing arrives:

- Is error reporting switched **on** for the site in Ghostwire? The key alone
  is not enough.
- Does `GHOSTWIRE_ERROR_KEY` match the current key? Issuing a new one
  invalidates the old.
- Can the server actually reach the host? A container on an isolated network
  often cannot.
