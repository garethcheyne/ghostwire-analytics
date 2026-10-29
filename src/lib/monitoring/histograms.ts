/*
 * Merging histogram rollup rows read from the database. A query groups by whatever it reports on
 * plus the bucket bounds (series with different bounds can't be summed bucket by bucket), so one
 * logical group can come back as several rows; these combine them and compute percentiles.
 */
import { type HistogramPart, percentiles } from '@/lib/otlp/percentile';

export interface HistogramRow {
  bounds: number[] | null;
  buckets: (number | bigint | string)[] | null;
  count: number | bigint | string | null;
  sum: number | string | null;
  min: number | string | null;
  max: number | string | null;
  /** Server errors among `count`, when the query counts them. */
  errors?: number | bigint | string | null;
}

export interface HistogramStats {
  count: number;
  errors: number;
  sum: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

const num = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));
const maybe = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** Combined count, sum, min/max, average and percentiles of rows that belong together. */
export function mergeHistograms(rows: HistogramRow[]): HistogramStats {
  let count = 0;
  let errors = 0;
  let sum = 0;
  let min: number | null = null;
  let max: number | null = null;
  const parts: HistogramPart[] = [];

  for (const row of rows) {
    count += num(row.count);
    errors += num(row.errors);
    sum += num(row.sum);
    const lo = maybe(row.min);
    const hi = maybe(row.max);
    if (lo !== null) min = min === null ? lo : Math.min(min, lo);
    if (hi !== null) max = max === null ? hi : Math.max(max, hi);
    if (row.buckets?.length && row.bounds) {
      parts.push({ bounds: row.bounds.map(Number), buckets: row.buckets.map(Number) });
    }
  }

  return {
    count,
    errors,
    sum,
    avg: count ? sum / count : null,
    min,
    max,
    ...percentiles(parts, min, max),
  };
}

/** Groups rows by a key and merges each group. */
export function mergeBy<T extends HistogramRow>(rows: T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return [...groups].map(([k, list]) => ({ key: k, first: list[0], stats: mergeHistograms(list) }));
}
