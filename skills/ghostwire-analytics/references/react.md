# React without Next: Vite, CRA, Remix

There is no server component to render the tag from, so the tracker goes in
`index.html` and the app only adds what it has to.

## The tracker

Put it in `index.html`, not in a `useEffect`. In the `<head>` it runs before
React mounts, so errors thrown while the bundle is loading are still caught —
which is when a good share of real crashes happen.

```html
<!-- index.html -->
<script
  defer
  src="https://analytics.example.com/script.js"
  data-website-id="YOUR-WEBSITE-ID"
  data-host-url="https://analytics.example.com"
  data-errors="true"
  data-performance="true"
></script>
```

Vite substitutes `%VITE_*%` placeholders in `index.html`, so the values can
come from the environment:

```html
<script defer src="%VITE_GHOSTWIRE_HOST%/script.js"
        data-website-id="%VITE_GHOSTWIRE_WEBSITE_ID%" ...></script>
```

Remember these are inlined **at build time**. A value absent during `vite build`
is absent for good; setting it only in the runtime container does nothing.

## Route changes

The tracker hooks `history.pushState`, so React Router, TanStack Router and
Remix navigations are counted automatically. Do not add an effect that calls
`track()` on navigation — it double-counts every page.

The exception is a router that swaps views without touching history at all
(rare, usually a hand-rolled state-based switcher). Only then:

```tsx
useEffect(() => {
  (window as any).ghostwire?.track();
}, [view]);
```

## A small helper

Every call site wants the same two guards — the tracker may not have loaded,
and analytics must never throw into a click handler.

```ts
// src/lib/analytics.ts
type Ghostwire = {
  track: (name: string, data?: Record<string, unknown>) => void;
  identify: (id: string | null, data?: Record<string, unknown>) => void;
  error: (error: unknown, context?: Record<string, unknown>) => void;
};

const tracker = () =>
  typeof window === 'undefined' ? undefined : (window as any).ghostwire as Ghostwire | undefined;

export function trackEvent(name: string, data?: Record<string, unknown>) {
  try { tracker()?.track(name, data); } catch { /* never break the caller */ }
}

export function identify(id: string | null, traits?: Record<string, unknown>) {
  try { tracker()?.identify(id, traits); } catch { /* ignore */ }
}

export function reportError(error: unknown, context?: Record<string, unknown>) {
  try { tracker()?.error(error, context); } catch { /* ignore */ }
}
```

For plain button clicks prefer the declarative form — no code at all:

```html
<button data-ghostwire-event="signup" data-ghostwire-event-plan="pro">Sign up</button>
```

## Errors

`data-errors="true"` already captures uncaught errors and rejected promises.
Two gaps worth closing:

**Errors your error boundary catches** never reach `window.onerror`. Report
from the boundary you already have:

```tsx
componentDidCatch(error: Error, info: React.ErrorInfo) {
  reportError(error, { componentStack: info.componentStack });
  // carry on doing whatever this boundary already did
}
```

**Errors you handle yourself** — report inside the existing catch. Do not wrap
app code in a new `try`/`catch` just to report; capture only observes, and
adding a catch changes how the app behaves.

```tsx
try {
  await placeOrder(cart);
} catch (e) {
  reportError(e, { orderId: cart.id });
  showToast('Order failed');        // the app's own handling, unchanged
}
```

## Identifying users

Only when asked for, and prefer the email — it is what support searches on.

```tsx
useEffect(() => {
  if (loading) return;              // not while auth is still resolving
  identify(user ? user.email : null, user ? { name: user.name } : undefined);
}, [loading, user]);
```

Passing `null` on sign-out returns the visitor to anonymous.

## Verify

Build and serve the production bundle, then confirm the tag survived
substitution:

```bash
npm run build && npx serve dist
curl -s http://localhost:3000/ | grep ghostwire
```

A `%VITE_…%` placeholder still in the output means the variable was not set at
build time.
