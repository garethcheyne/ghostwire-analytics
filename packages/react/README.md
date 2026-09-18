# @ghostwire/react

React bindings for [Ghostwire Analytics](https://github.com/garethcheyne/ghostwire-analytics):
page views, identified users and error reporting.

```bash
npm install @ghostwire/react
```

## Set up

Wrap your app. Page views, including client-side route changes, are recorded automatically.

```tsx
import { GhostwireProvider } from '@ghostwire/react';

export function Root() {
  const user = useCurrentUser(); // your auth

  return (
    <GhostwireProvider
      host="https://analytics.example.com"
      websiteId="7d3ecc49-7e12-4672-b092-685c96d2a6d4"
      errors
      user={user && { id: user.username, email: user.email, name: user.name }}
    >
      <App />
    </GhostwireProvider>
  );
}
```

| Prop | |
| --- | --- |
| `host` | Your Ghostwire Analytics server, or `/_gw` when you proxy it through your own domain (see `withGhostwire` in `@ghostwire/node/next`). |
| `websiteId` | From the website's settings in Ghostwire. |
| `errors` | Capture uncaught errors and rejected promises. Error reporting must also be switched on in the website's settings. |
| `user` | The signed-in user (`id` plus any fields you want to search by, like `email`). `null` when signed out: the visitor goes back to anonymous. |
| `autoTrack` | Record page views automatically. Default `true`. |
| `domains` | Only track on these hostnames. |
| `scriptName` | The tracker's path on your server, if renamed. Default `script.js`. |

The provider works with Vite, Create React App, Remix and Next.js (it's a client component).

## Identified users

Passing `user` lets support find someone under **Users** in Ghostwire and see what they did:
their visits, errors and replays. Only do this where your privacy policy covers it.

## Errors

Error capture **only observes**. It never catches, cancels or rethrows your errors, and it never
wraps `fetch` or `console`. The browser still logs errors and your own handlers still run.

- **Uncaught errors and rejected promises** are captured with `errors`.
- **Errors your error boundaries catch** are only logged by React. To report them too (React 19):

  ```tsx
  import { ghostwireRootOptions } from '@ghostwire/react';

  createRoot(container, ghostwireRootOptions()).render(<Root />);
  // or with your own options: ghostwireRootOptions({ onCaughtError, onRecoverableError })
  ```

- **Errors you handle yourself:**

  ```tsx
  import { useGhostwire } from '@ghostwire/react';

  const { error } = useGhostwire();

  try {
    await placeOrder(cart);
  } catch (e) {
    error(e, { orderId: cart.id });
    showToast('Order failed');
  }
  ```

- **A fallback UI** that also reports: `GhostwireErrorBoundary`. Only use it where you want the
  fallback; it replaces the crashed children.

  ```tsx
  <GhostwireErrorBoundary fallback={({ reset }) => <button onClick={reset}>Try again</button>}>
    <Checkout />
  </GhostwireErrorBoundary>
  ```

Errors thrown before React runs (while the page first loads) are missed by the provider. To catch
those too, put the tracker script in your HTML `<head>` with `data-errors="true"`; the provider
reuses it instead of adding another.

## Events

```tsx
const { track } = useGhostwire();
track('signup', { plan: 'pro' });
```

Calls made before the tracker has loaded are queued. During server rendering they do nothing.

## Develop

```bash
npm install
npm test
npm run build
```
