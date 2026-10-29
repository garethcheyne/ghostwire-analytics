/*
 * Cumulative to delta. Counters and histograms sent with cumulative temporality (the Collector's
 * docker_stats and hostmetrics receivers, Prometheus-style SDKs) carry running totals; the rollups
 * store what happened in each minute. The last total per stream is kept (monitor_cumulative), and
 * each new point becomes the difference from it.
 *
 *   - first point of a stream: a baseline, nothing stored, unless the stream started in the last
 *     FRESH_START_MS (a process that just started: its whole total happened just now);
 *   - a new start time, a total that went down, or histogram buckets that changed shape: the
 *     process restarted (or the counter reset), so the whole new total is the delta.
 */
import type { MetricPoint } from './metrics';
import { KIND } from './metrics';

export const FRESH_START_MS = 10 * 60 * 1000;

export interface CumulativeState {
  startMs: number;
  /** Counter total, or histogram sum. */
  value: number;
  count: number;
  buckets: number[];
}

export function stateOf(point: MetricPoint): CumulativeState {
  return {
    startMs: point.startMs,
    value: point.kind === KIND.counter ? point.value : point.sum,
    count: point.count,
    buckets: point.buckets,
  };
}

/** Whether the start time moved (1 ms tolerance: start times round-trip through floats). */
function restarted(point: MetricPoint, prev: CumulativeState) {
  return point.startMs > 0 && prev.startMs > 0 && Math.abs(point.startMs - prev.startMs) > 1;
}

/**
 * The delta for a cumulative point given the stream's previous state (undefined for a new stream),
 * and the state to keep. `delta` is null when there is nothing to store yet (a baseline).
 */
export function toDelta(
  point: MetricPoint,
  prev: CumulativeState | undefined,
  now = Date.now(),
): { delta: MetricPoint | null; next: CumulativeState } {
  const next = stateOf(point);
  const whole = { ...point, cumulative: false };

  if (!prev) {
    const fresh = point.startMs > 0 && point.startMs <= point.timeMs && now - point.startMs <= FRESH_START_MS;
    return { delta: fresh ? whole : null, next };
  }

  if (restarted(point, prev)) return { delta: whole, next };

  if (point.kind === KIND.counter) {
    if (point.value < prev.value) return { delta: whole, next };
    return { delta: { ...point, cumulative: false, value: point.value - prev.value }, next };
  }

  // Histogram (or summary).
  if (point.count < prev.count || point.buckets.length !== prev.buckets.length) {
    return { delta: whole, next };
  }

  const buckets = point.buckets.map((n, i) => n - prev.buckets[i]);
  if (buckets.some(n => n < 0)) return { delta: whole, next };

  return {
    delta: {
      ...point,
      cumulative: false,
      count: point.count - prev.count,
      sum: point.sum - prev.value,
      // A running histogram's min and max are for its whole life, not this interval.
      min: null,
      max: null,
      buckets,
    },
    next,
  };
}

/**
 * Applies toDelta to every cumulative point (in time order per stream, several points of one
 * stream in a request chain), leaving delta and gauge points as they are.
 */
export function applyDeltas(
  points: MetricPoint[],
  states: Map<string, CumulativeState>,
  now = Date.now(),
): { points: MetricPoint[]; changed: Map<string, CumulativeState> } {
  const out: MetricPoint[] = [];
  const changed = new Map<string, CumulativeState>();
  const ordered = [...points].sort((a, b) => a.timeMs - b.timeMs);

  for (const point of ordered) {
    if (!point.cumulative) {
      out.push(point);
      continue;
    }

    // A retried export repeats the same total, which makes a zero delta: harmless.
    const prev = changed.get(point.stream) ?? states.get(point.stream);
    const { delta, next } = toDelta(point, prev, now);
    changed.set(point.stream, next);
    if (delta) out.push(delta);
  }

  return { points: out, changed };
}
