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
