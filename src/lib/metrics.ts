/*
 * Traffic counters, logged as one `stats` line every 5 minutes instead of a line per hit:
 * how much tracking the app took in, what it dropped and why, and how many server errors.
 */
import { log } from '@/lib/logger';

const INTERVAL_MS = 5 * 60 * 1000;

let counters = new Map<string, number>();
let since = Date.now();
let started = false;

/** Adds to a counter, e.g. count('send.dropped.bot'). */
export function count(name: string, by = 1) {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

/** The counters since the last flush, and resets them. */
export function takeCounters() {
  const snapshot = Object.fromEntries([...counters.entries()].sort());
  const window = {
    from: new Date(since).toISOString(),
    seconds: Math.round((Date.now() - since) / 1000),
  };
  counters = new Map();
  since = Date.now();
  return { counters: snapshot, window };
}

export function flushStats() {
  const { counters: snapshot, window } = takeCounters();
  // Quiet periods still log, so a gap in the logs means the app wasn't running.
  log.info('stats', { ...window, counters: snapshot });
}

export function startStatsSchedule() {
  if (started) return;
  started = true;

  setInterval(flushStats, INTERVAL_MS).unref?.();
}
