# Plain HTML, and anything that serves it

Covers a static site, WordPress, Hugo, Astro, Jekyll, a templated server app,
or injecting the tracker at a reverse proxy.

## The tag

One script in `<head>`, on every page:

```html
<script
  defer
  src="https://analytics.example.com/script.js"
  data-website-id="YOUR-WEBSITE-ID"
  data-host-url="https://analytics.example.com"
  data-errors="true"
  data-performance="true"
></script>
```

Put it in the shared layout — the base template, `header.php`, `BaseHead.astro`,
`_document`, whatever every page includes. A tag added to one page measures one
page.

### The attributes worth knowing

| Attribute | Effect |
|---|---|
| `data-website-id` | Required. The site's UUID. |
| `data-host-url` | Where to post to. Set it when the script is served from a different origin than the instance (see proxying below). |
| `data-errors="true"` | Capture uncaught errors and rejected promises. Also needs errors switched on for the site in Ghostwire. |
| `data-performance="true"` | Add Core Web Vitals (LCP, INP, CLS, FCP, TTFB) to the page view. |
| `data-release="1.4.2"` | Tag data with a version, so "new in this release" works. |
| `data-domains="a.com,b.com"` | Only track on these hostnames — useful when the same template serves staging. |
| `data-tag="marketing"` | Label this traffic for filtering in reports. |
| `data-auto-track="false"` | Stop automatic page views; you call `ghostwire.track()` yourself. |
| `data-exclude-search="true"` | Drop query strings, which can carry tokens or personal data. |

Session replay and heatmaps need a second tag:

```html
<script defer src="https://analytics.example.com/recorder.js"
        data-website-id="YOUR-WEBSITE-ID"
        data-host-url="https://analytics.example.com"></script>
```

The recorder asks the server whether recording is switched on before it records
anything, so leaving the tag in place is harmless while the feature is off.

## Events without JavaScript

Any element can carry an event, picked up on click:

```html
<button data-ghostwire-event="signup" data-ghostwire-event-plan="pro">
  Start free trial
</button>
```

The event is named `signup` with `{ plan: "pro" }` attached. This is the right
default for buttons and links — it survives template changes better than an
inline handler.

For anything else:

```html
<script>
  // Calls made before the tracker finishes loading are queued, so this is safe.
  window.ghostwire && window.ghostwire.track('newsletter-signup', { source: 'footer' });
</script>
```

## WordPress

Add it to the theme, not to a post. In the active theme's `functions.php`:

```php
add_action('wp_head', function () {
  ?>
  <script defer src="https://analytics.example.com/script.js"
          data-website-id="YOUR-WEBSITE-ID"
          data-host-url="https://analytics.example.com"
          data-performance="true"></script>
  <?php
});
```

Use a child theme, or the tag disappears at the next theme update. If the site
runs a caching plugin, purge the cache afterwards — that is the usual reason a
freshly added tag does not appear in the served HTML.

## Serving the tracker from your own domain

Ad blockers commonly block third-party analytics hosts, and some block any path
ending `script.js`. Proxying the tracker through the site's own domain makes it
first-party, so it is neither blocked nor a cross-origin request.

Proxy these five paths to the Ghostwire instance, then point the tag at the
local path:

| Path on your site | Proxies to |
|---|---|
| `/_gw/script.js` | `<host>/script.js` |
| `/_gw/recorder.js` | `<host>/recorder.js` |
| `/_gw/api/send` | `<host>/api/send` |
| `/_gw/api/record` | `<host>/api/record` |
| `/_gw/api/websites/:id/recorder` | `<host>/api/websites/:id/recorder` |

```html
<script defer src="/_gw/script.js" data-website-id="YOUR-WEBSITE-ID"
        data-host-url="/_gw" data-performance="true"></script>
```

Nginx:

```nginx
location /_gw/ {
  proxy_pass https://analytics.example.com/;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # keeps visitor geography accurate
}
```

Next.js users can get the same rewrites from `withGhostwire` in
`@ghostwire/node/next`.

Only proxy those paths. Do not proxy the Ghostwire app itself.

## Injecting at the proxy, with no change to the site

Where the site cannot be edited at all, a reverse proxy can insert the tag into
every HTML response. Ghostwire's own settings screen generates this for
ghostwire-proxy; for plain OpenResty or nginx with `sub_filter`:

```nginx
proxy_set_header Accept-Encoding "";      # ask for uncompressed HTML so it can be edited
sub_filter_types text/html;
sub_filter_once on;
sub_filter '</head>' '<script defer src="https://analytics.example.com/script.js" data-website-id="YOUR-WEBSITE-ID"></script></head>';
```

Clearing `Accept-Encoding` costs compression between proxy and origin, which is
usually a local hop; the response to the browser is compressed as normal.

## Content-Security-Policy

If the site sends a CSP, the Ghostwire host must be in **both**:

```
script-src 'self' https://analytics.example.com;
connect-src 'self' https://analytics.example.com;
```

`script-src` alone loads the tracker and blocks every page view it tries to
send. Check for a `<meta http-equiv="Content-Security-Policy">` tag as well as
response headers.

## Verify

```bash
curl -s https://yoursite.example/ | grep ghostwire
```

Then load the page with the network panel open and look for a `POST` to
`/api/send` returning 200 or 204. If the tag is present but no request goes
out, it is CSP or an ad blocker.
