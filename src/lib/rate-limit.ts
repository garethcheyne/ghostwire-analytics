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

interface LimiterOptions {
  /** Distinguishes this limiter's counters in the shared store. */
  name: string;
  limit: number;
  windowMs: number;
}

/** With RATE_LIMIT_STORE=postgres, every app container shares the counters. */
export function usesSharedStore(env: Record<string, string | undefined> = process.env) {
  return env.RATE_LIMIT_STORE === 'postgres';
}

const SWEEP_EVERY_MS = 10 * 60 * 1000;
let lastSharedSweep = 0;

/** Counts a hit in Postgres (one row per key and window) and returns the window's total. */
async function sharedHit(key: string, windowMs: number, now: number) {
  const { default: prisma } = await import('@/lib/prisma');
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  // Old windows are cleared now and then by whichever request comes along.
  if (now - lastSharedSweep > SWEEP_EVERY_MS) {
    lastSharedSweep = now;
    void prisma.client.rateLimit
      .deleteMany({ where: { windowStart: { lt: new Date(now - 60 * 60 * 1000) } } })
      .catch(() => {});
  }

  const [row] = await prisma.client.$queryRaw<{ count: number }[]>`
    insert into rate_limit (key, window_start, count) values (${key}, ${windowStart}, 1)
    on conflict (key, window_start) do update set count = rate_limit.count + 1
    returning count`;

  return Number(row?.count ?? 0);
}

/**
 * A limiter that uses the shared Postgres store when configured, otherwise memory. A store that
 * can't be reached lets the request through: limits protect the server, not the other way round.
 */
export function createLimiter({ name, limit, windowMs }: LimiterOptions) {
  const memory = createRateLimiter({ limit, windowMs });

  return async function allow(key: string, now = Date.now()) {
    if (!usesSharedStore()) return memory(key, now);

    try {
      return (await sharedHit(`${name}:${key}`.slice(0, 200), windowMs, now)) <= limit;
    } catch (e) {
      console.error('Rate limit store unavailable; allowing the request:', e);
      return true;
    }
  };
}

/**
 * A limiter keyed by the client's IP (from the proxy headers). Requests without a known IP are
 * always allowed, so a missing header never blocks every visitor at once.
 */
export function createIpRateLimiter(options: LimiterOptions) {
  const allow = createLimiter(options);

  return async (request: Request) => {
    const ip = getIpAddress(request.headers);
    return !ip || allow(ip);
  };
}
