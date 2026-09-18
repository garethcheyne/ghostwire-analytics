/*
 * Traffic counters, logged as one `stats` line every 5 minutes (STATS_INTERVAL_MINUTES) instead
 * of a line per hit:
 * how much tracking the app took in, what it dropped and why, and how many server errors.
 *
 * Next.js bundles route handlers and instrumentation separately, so each bundle gets its own
 * copy of this module; the counters live on globalThis so they're shared across all of them.
 */
import { log } from '@/lib/logger';

interface MetricsState {
  counters: Map<string, number>;
  since: number;
  started: boolean;
}

const state: MetricsState = ((globalThis as any).__ghostwireMetrics ??= {
  counters: new Map<string, number>(),
  since: Date.now(),
  started: false,
});

/** Adds to a counter, e.g. count('send.dropped.bot'). */
export function count(name: string, by = 1) {
  state.counters.set(name, (state.counters.get(name) ?? 0) + by);
}

/** The counters since the last flush, and resets them. */
export function takeCounters() {
  const snapshot = Object.fromEntries([...state.counters.entries()].sort());
  const window = {
    from: new Date(state.since).toISOString(),
    seconds: Math.round((Date.now() - state.since) / 1000),
  };
  state.counters = new Map();
  state.since = Date.now();
  return { counters: snapshot, window };
}

export function flushStats() {
  const { counters: snapshot, window } = takeCounters();
  // Quiet periods still log, so a gap in the logs means the app wasn't running.
  log.info('stats', { ...window, counters: snapshot });
}

export function startStatsSchedule() {
  if (state.started) return;
  state.started = true;

  const minutes = Number(process.env.STATS_INTERVAL_MINUTES) || 5;
  setInterval(flushStats, Math.max(1, minutes) * 60 * 1000).unref?.();
}
