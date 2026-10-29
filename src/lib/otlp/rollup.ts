/*
 * Rolls metric points (already deltas or gauge readings) up into one row per minute per service,
 * metric and attribute set, so a request costs one batched upsert however many points it holds.
 */
import { KIND, type MetricKind, type MetricPoint } from './metrics';

export const MINUTE_MS = 60_000;

export interface RollupRow {
  serviceKey: string;
  metric: string;
  attrsHash: string;
  /** Start of the minute, epoch ms. */
  bucket: number;
  kind: MetricKind;
  unit: string | null;
  attrs: Record<string, string | number | boolean>;
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  last: number | null;
  lastTime: number;
  bounds: number[];
  buckets: number[];
}

const lower = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b));
const higher = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));

export function rollupKey(row: Pick<RollupRow, 'serviceKey' | 'metric' | 'attrsHash' | 'bucket'>) {
  return `${row.serviceKey}\u0001${row.metric}\u0001${row.attrsHash}\u0001${row.bucket}`;
}

/** Adds one point to its minute's row. */
function add(row: RollupRow, point: MetricPoint) {
  if (point.kind === KIND.counter) {
    row.sum += point.value;
    row.count += 1;
    return;
  }

  if (point.kind === KIND.gauge) {
    row.sum += point.value;
    row.count += 1;
    row.min = lower(row.min, point.value);
    row.max = higher(row.max, point.value);
    if (point.timeMs >= row.lastTime) {
      row.last = point.value;
      row.lastTime = point.timeMs;
    }
    return;
  }

  row.count += point.count;
  row.sum += point.sum;
  row.min = lower(row.min, point.min);
  row.max = higher(row.max, point.max);
  if (point.buckets.length) {
    if (!row.buckets.length) {
      row.bounds = point.bounds;
      row.buckets = [...point.buckets];
    } else if (row.buckets.length === point.buckets.length) {
      for (let i = 0; i < row.buckets.length; i++) row.buckets[i] += point.buckets[i];
    }
  }
}

export function rollup(points: MetricPoint[]): RollupRow[] {
  const rows = new Map<string, RollupRow>();

  for (const point of points) {
    const bucket = Math.floor(point.timeMs / MINUTE_MS) * MINUTE_MS;
    const key = rollupKey({ serviceKey: point.service.key, metric: point.metric, attrsHash: point.attrsHash, bucket });
    let row = rows.get(key);

    if (!row) {
      row = {
        serviceKey: point.service.key,
        metric: point.metric,
        attrsHash: point.attrsHash,
        bucket,
        kind: point.kind,
        unit: point.unit,
        attrs: point.attrs,
        count: 0,
        sum: 0,
        min: null,
        max: null,
        last: null,
        lastTime: 0,
        bounds: [],
        buckets: [],
      };
      rows.set(key, row);
    }

    // A metric that changed type keeps the first one seen in the minute.
    if (row.kind !== point.kind) continue;
    add(row, point);
  }

  return [...rows.values()];
}
