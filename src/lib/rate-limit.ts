import { getIpAddress } from './ip';

/**
 * Fixed-window counters kept in memory. Good enough for a single app instance; each key may
 * be used `limit` times per `windowMs`.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const windows = new Map<string, { start: number; count: number }>();
  let lastSweep = Date.now();

  return function allow(key: string, now = Date.now()) {
    // Drop expired windows now and then so the map doesn't grow forever.
    if (now - lastSweep > windowMs) {
      for (const [k, window] of windows) {
        if (now - window.start >= windowMs) windows.delete(k);
      }
      lastSweep = now;
    }

    const window = windows.get(key);

    if (!window || now - window.start >= windowMs) {
      windows.set(key, { start: now, count: 1 });
      return true;
    }

    window.count += 1;
    return window.count <= limit;
  };
}

/**
 * A limiter keyed by the client's IP (from the proxy headers). Requests without a known IP are
 * always allowed, so a missing header never blocks every visitor at once.
 */
export function createIpRateLimiter(options: { limit: number; windowMs: number }) {
  const allow = createRateLimiter(options);

  return (request: Request) => {
    const ip = getIpAddress(request.headers);
    return !ip || allow(ip);
  };
}
