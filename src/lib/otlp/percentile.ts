/*
 * Percentiles from explicit-bucket histograms, the way Prometheus' histogram_quantile does it:
 * find the bucket holding the q-th observation and interpolate linearly inside it. Several
 * histograms (e.g. series with different bucket bounds) are merged as one list of buckets.
 */

export interface HistogramPart {
  /** Upper bounds; buckets has one more entry (everything above the last bound). */
  bounds: number[];
  buckets: number[];
}

interface Segment {
  lower: number;
  upper: number;
  count: number;
}

function segments(part: HistogramPart, min: number | null, max: number | null): Segment[] {
  const { bounds, buckets } = part;
  if (!buckets.length || buckets.length !== bounds.length + 1) return [];

  return buckets.map((count, i) => {
    const upper = i < bounds.length ? bounds[i] : (max ?? bounds[bounds.length - 1] ?? 0);
    const lower =
      i === 0 ? Math.min(min ?? Math.min(0, bounds[0] ?? 0), bounds[0] ?? 0) : bounds[i - 1];
    return { lower, upper: Math.max(upper, lower), count: Number(count) || 0 };
  });
}

/**
 * The q-th quantile (0..1) of the merged histograms, or null when they hold no observations.
 * `min`/`max`, when known, bound the answer and close the open-ended buckets.
 */
export function percentile(
  parts: HistogramPart[],
  q: number,
  min: number | null = null,
  max: number | null = null,
): number | null {
  const all = parts
    .flatMap(part => segments(part, min, max))
    .filter(s => s.count > 0)
    .sort((a, b) => a.upper - b.upper || a.lower - b.lower);
  const total = all.reduce((sum, s) => sum + s.count, 0);

  if (!total) return null;

  const target = Math.min(Math.max(q, 0), 1) * total;
  let seen = 0;

  for (const s of all) {
    if (seen + s.count >= target) {
      const within = s.count ? (target - seen) / s.count : 0;
      let value = s.lower + (s.upper - s.lower) * within;
      if (min !== null) value = Math.max(value, min);
      if (max !== null) value = Math.min(value, max);
      return value;
    }
    seen += s.count;
  }

  return max ?? all[all.length - 1].upper;
}

/** p50, p95 and p99 together. */
export function percentiles(parts: HistogramPart[], min: number | null = null, max: number | null = null) {
  return {
    p50: percentile(parts, 0.5, min, max),
    p95: percentile(parts, 0.95, min, max),
    p99: percentile(parts, 0.99, min, max),
  };
}
