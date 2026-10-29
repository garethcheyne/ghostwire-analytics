/*
 * Flattens an ExportMetricsServiceRequest (OTLP/JSON shape) into metric points ready to roll up.
 * Pure: no database. Cumulative points still need turning into deltas (cumulative.ts).
 */
import {
  admitMetric,
  canonicalMetricName,
  hashKey,
  limitSeries,
  type SeriesAttributes,
  seriesAttributes,
} from './attributes';
import { readService, type ServiceInfo } from './service';
import { type Attributes, LIMITS, nanosToMs, readAttributes, toNanos, toNumber } from './values';

export const MAX_POINTS_PER_REQUEST = 20_000;
const MAX_BUCKETS = 160;

export const KIND = { counter: 1, gauge: 2, histogram: 3 } as const;
export type MetricKind = (typeof KIND)[keyof typeof KIND];

export interface MetricPoint {
  service: ServiceInfo;
  /** Identifies the original stream (resource + metric + all attributes), for cumulative deltas. */
  stream: string;
  metric: string;
  unit: string | null;
  kind: MetricKind;
  /** Counters and histograms sent as running totals: turned into deltas before storing. */
  cumulative: boolean;
  attrs: SeriesAttributes;
  attrsHash: string;
  timeMs: number;
  startMs: number;
  /** Counter: the value (delta or running total). Gauge: the reading. Histogram: unused. */
  value: number;
  count: number;
  sum: number;
  min: number | null;
  max: number | null;
  bounds: number[];
  buckets: number[];
}

export interface FlattenResult {
  points: MetricPoint[];
  rejected: number;
  /** Services seen in the request, by key. */
  services: Map<string, ServiceInfo>;
  /** Services whose ghostwire.heartbeat counter went up (delta points). */
  heartbeats: Set<string>;
  overflowed: number;
}

const TIME_UNITS: Record<string, number> = { s: 1000, ms: 1, us: 0.001, 'µs': 0.001, ns: 0.000001 };

/** Multiplier taking a duration histogram to milliseconds, or null to leave it as it is. */
export function durationFactor(metric: string, unit: string | undefined): number | null {
  if (!metric.endsWith('.duration')) return null;
  const factor = TIME_UNITS[(unit ?? '').trim()];
  return factor ?? null;
}

const finite = (value: unknown) => {
  const n = Number(value);
  return value !== undefined && value !== null && Number.isFinite(n) ? n : null;
};

function numberValue(point: any): number | null {
  if (point.asDouble !== undefined && point.asDouble !== null) return finite(point.asDouble);
  if (point.asInt !== undefined && point.asInt !== null) return toNumber(point.asInt);
  return null;
}

/** Exponential histogram buckets as explicit ones (bounds = bucket edges), at most MAX_BUCKETS. */
export function exponentialToExplicit(point: any): { bounds: number[]; buckets: number[] } {
  let scale = Math.trunc(toNumber(point.scale));
  let offset = Math.trunc(toNumber(point.positive?.offset));
  let counts: number[] = (Array.isArray(point.positive?.bucketCounts) ? point.positive.bucketCounts : []).map(
    toNumber,
  );
  const negative = (Array.isArray(point.negative?.bucketCounts) ? point.negative.bucketCounts : []).reduce(
    (sum: number, n: unknown) => sum + toNumber(n),
    0,
  );

  // Halve the resolution until it fits (adjacent buckets merge, the offset halves).
  while (counts.length > MAX_BUCKETS) {
    const merged: number[] = [];
    const start = offset & 1 ? 1 : 0;
    if (start) merged.push(counts[0]);
    for (let i = start; i < counts.length; i += 2) merged.push(counts[i] + (counts[i + 1] ?? 0));
    counts = merged;
    offset = Math.floor(offset / 2);
    scale -= 1;
  }

  const base = 2 ** (2 ** -scale);
  const bounds = [base ** offset, ...counts.map((_, i) => base ** (offset + i + 1))];
  const buckets = [toNumber(point.zeroCount) + negative, ...counts, 0];

  return { bounds, buckets };
}

/** Bounds must be finite and ascending, with one more bucket than bounds. */
function validHistogram(bounds: number[], buckets: number[]) {
  if (buckets.length !== bounds.length + 1 || bounds.length > MAX_BUCKETS) return false;
  for (let i = 0; i < bounds.length; i++) {
    if (!Number.isFinite(bounds[i]) || (i > 0 && bounds[i] <= bounds[i - 1])) return false;
  }
  return buckets.every(n => Number.isFinite(n) && n >= 0);
}

export function flattenMetrics(
  websiteId: string,
  request: any,
  options: { maxPoints?: number } = {},
): FlattenResult {
  const maxPoints = options.maxPoints ?? MAX_POINTS_PER_REQUEST;
  const result: FlattenResult = {
    points: [],
    rejected: 0,
    services: new Map(),
    heartbeats: new Set(),
    overflowed: 0,
  };

  const resourceMetrics = Array.isArray(request?.resourceMetrics) ? request.resourceMetrics : [];

  for (const rm of resourceMetrics) {
    const resourceAttrs = readAttributes(rm?.resource?.attributes);
    const service = readService(resourceAttrs);
    const resourceId = hashKey(resourceAttrs, 32);
    let serviceUsed = false;

    for (const sm of Array.isArray(rm?.scopeMetrics) ? rm.scopeMetrics : []) {
      for (const metric of Array.isArray(sm?.metrics) ? sm.metrics : []) {
        const rawName = typeof metric?.name === 'string' ? metric.name : '';
        const data =
          metric.gauge ?? metric.sum ?? metric.histogram ?? metric.exponentialHistogram ?? metric.summary;
        const dataPoints: any[] = Array.isArray(data?.dataPoints) ? data.dataPoints : [];

        if (!rawName || rawName.length > LIMITS.metricNameLength * 2) {
          result.rejected += dataPoints.length;
          continue;
        }

        const name = canonicalMetricName(rawName);

        if (!admitMetric(websiteId, `${service.key}\u0000${name}`)) {
          result.rejected += dataPoints.length;
          continue;
        }

        const unit = typeof metric.unit === 'string' ? metric.unit.slice(0, 30) : '';
        const factor = durationFactor(name, unit);
        const storedUnit = factor !== null ? 'ms' : unit || null;

        for (const point of dataPoints) {
          if (result.points.length >= maxPoints) {
            result.rejected += 1;
            continue;
          }
          // Flag bit 1: no recorded value (a stale marker from the Collector).
          if (toNumber(point?.flags) & 1) continue;

          const pointAttrs: Attributes = readAttributes(point.attributes);
          const timeMs = nanosToMs(toNanos(point.timeUnixNano));
          const startMs = nanosToMs(toNanos(point.startTimeUnixNano));

          if (!timeMs) {
            result.rejected += 1;
            continue;
          }

          const base = seriesAttributes(name, pointAttrs, resourceAttrs);
          const limited = limitSeries(`${websiteId}\u0000${service.key}\u0000${name}`, hashKey(base), base);
          if (limited.overflow) result.overflowed += 1;

          const common = {
            service,
            stream: hashKey([resourceId, name, pointAttrs], 32),
            metric: name,
            unit: storedUnit,
            attrs: limited.attrs,
            attrsHash: limited.attrsHash,
            timeMs,
            startMs,
            count: 0,
            sum: 0,
            min: null,
            max: null,
            bounds: [] as number[],
            buckets: [] as number[],
          };

          let parsed: MetricPoint | null = null;

          if (metric.gauge || metric.sum) {
            const value = numberValue(point);
            if (value === null) {
              result.rejected += 1;
              continue;
            }
            const temporality = toNumber(metric.sum?.aggregationTemporality);
            const monotonic = !!metric.sum?.isMonotonic;

            if (metric.sum && (monotonic || temporality === 1)) {
              // Monotonic counters, and any sum sent as deltas: totals per minute.
              parsed = { ...common, kind: KIND.counter, cumulative: temporality === 2, value, count: 1 };
            } else {
              // Gauges, and running up/down totals (memory in use, open connections): readings.
              parsed = { ...common, kind: KIND.gauge, cumulative: false, value, count: 1, sum: value, min: value, max: value };
            }
          } else if (metric.histogram || metric.exponentialHistogram) {
            const temporality = toNumber((metric.histogram ?? metric.exponentialHistogram).aggregationTemporality);
            let bounds: number[];
            let buckets: number[];

            if (metric.histogram) {
              bounds = (Array.isArray(point.explicitBounds) ? point.explicitBounds : []).map(Number);
              buckets = (Array.isArray(point.bucketCounts) ? point.bucketCounts : []).map(toNumber);
              // No buckets at all is allowed (count and sum only).
              if (!buckets.length) bounds = [];
            } else {
              ({ bounds, buckets } = exponentialToExplicit(point));
            }

            if (buckets.length && !validHistogram(bounds, buckets)) {
              result.rejected += 1;
              continue;
            }

            const f = factor ?? 1;
            parsed = {
              ...common,
              kind: KIND.histogram,
              cumulative: temporality === 2,
              value: 0,
              count: toNumber(point.count),
              sum: (finite(point.sum) ?? 0) * f,
              min: finite(point.min) !== null ? finite(point.min)! * f : null,
              max: finite(point.max) !== null ? finite(point.max)! * f : null,
              bounds: bounds.map(b => b * f),
              buckets,
              // Different bucket bounds make a different series, so stored buckets always line up.
              attrsHash: bounds.length ? hashKey([limited.attrsHash, bounds]) : limited.attrsHash,
            };
          } else if (metric.summary) {
            // Prometheus-style summaries: count and sum only, always running totals.
            parsed = {
              ...common,
              kind: KIND.histogram,
              cumulative: true,
              value: 0,
              count: toNumber(point.count),
              sum: (finite(point.sum) ?? 0) * (factor ?? 1),
            };
          }

          if (!parsed) {
            result.rejected += 1;
            continue;
          }

          result.points.push(parsed);
          serviceUsed = true;
          // A beat counts when the counter moved (running totals are checked after the delta).
          if (name === 'ghostwire.heartbeat' && !parsed.cumulative && parsed.value > 0) {
            result.heartbeats.add(service.key);
          }
        }
      }
    }

    if (serviceUsed || !result.services.has(service.key)) result.services.set(service.key, service);
  }

  return result;
}
