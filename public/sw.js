/*
 * Ghostwire Analytics service worker: push notifications, and enough offline support to install
 * as an app. Build assets are cached (their names change with every build); pages and the API are
 * always fetched, falling back to a short "you're offline" page.
 */
const CACHE = 'ghostwire-static-v1';
const SCOPE = new URL(self.registration.scope);
const BASE = SCOPE.pathname.replace(/\/$/, '');
const ICON = `${BASE}/icons/icon-192.png`;
const BADGE = `${BASE}/icons/badge-96.png`;
// Registered as sw.js?dev=1 by the dev server, whose build files keep their names between edits.
const CACHE_ASSETS = !new URL(self.location.href).searchParams.has('dev');

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline | Ghostwire Analytics</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;color:#e2e8f0;
font:15px system-ui,sans-serif;text-align:center;padding:16px}img{width:72px;height:72px}
button{margin-top:16px;padding:8px 16px;border:0;border-radius:8px;background:#0ea5e9;color:#fff;font:inherit;cursor:pointer}
p{color:#94a3b8}</style></head><body><div><img src="${ICON}" alt=""><h1>You're offline</h1>
<p>Ghostwire Analytics needs a connection to load your data.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

// Caching is a nicety: if storage is unavailable (full, or blocked), push still has to work.
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll([ICON, BADGE]))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== SCOPE.origin) return;

  if (
    CACHE_ASSETS &&
    (url.pathname.startsWith(`${BASE}/_next/static/`) || url.pathname.startsWith(`${BASE}/icons/`))
  ) {
    event.respondWith(
      caches
        .match(request)
        .catch(() => undefined)
        .then(
          cached =>
            cached ||
            fetch(request).then(response => {
              if (response.ok) {
                const copy = response.clone();
                caches
                  .open(CACHE)
                  .then(cache => cache.put(request, copy))
                  .catch(() => {});
              }
              return response;
            }),
        ),
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      ),
    );
  }
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'Ghostwire Analytics';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: ICON,
      badge: BADGE,
      tag: data.tag || undefined,
      renotify: !!data.tag,
      requireInteraction: data.level === 'danger',
      data: { url: data.url || `${BASE}/websites` },
    }),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || `${BASE}/websites`, SCOPE).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
      const open = windows.find(client => new URL(client.url).origin === new URL(target).origin);
      if (open) {
        return open
          .focus()
          .then(client => (client.url === target ? client : client.navigate(target)))
          .catch(() => self.clients.openWindow(target));
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Browsers occasionally rotate a subscription; register the new one so alerts keep arriving.
self.addEventListener('pushsubscriptionchange', event => {
  const key = event.oldSubscription?.options?.applicationServerKey;
  if (!key) return;

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then(subscription =>
        fetch(`${BASE}/api/push/subscriptions`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(subscription.toJSON()),
        }),
      )
      .catch(() => {}),
  );
});
