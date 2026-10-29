/*
 * Cardinality rules for metric series. A series is one service + metric + attribute set; each one
 * becomes a row per minute, so only a bounded, documented set of attributes is kept per metric
 * family, and high-cardinality ones (full URLs, IPs, user agents, IDs) never are. On top of that,
 * a metric that still produces too many attribute sets has the rest folded into one overflow
 * series, like the OpenTelemetry SDK's own cardinality limit (otel.metric.overflow = true).
 *
 * AGENTS.md ("System monitoring") documents these rules; keep the two in step.
 */
import { createHash } from 'node:crypto';
import { type Attributes, LIMITS, canonicalJson } from './values';

/** Older semantic-convention names, read as their current names. */
const ATTRIBUTE_RENAMES: Record<string, string> = {
  'http.method': 'http.request.method',
  'http.status_code': 'http.response.status_code',
  'net.peer.name': 'server.address',
  'db.system.name': 'db.system',
  'db.operation': 'db.operation.name',
  'db.sql.table': 'db.collection.name',
  'messaging.destination': 'messaging.destination.name',
};

/** Older metric names, stored under the current ones (http.server.duration was in ms, now s: both end up ms). */
const METRIC_RENAMES: Record<string, string> = {
  'http.server.duration': 'http.server.request.duration',
  'http.client.duration': 'http.client.request.duration',
  'db.client.duration': 'db.client.operation.duration',
};

/** The attributes kept per metric family (first matching prefix wins). */
const SERIES_KEYS: Array<[prefix: string, keys: string[]]> = [
  ['http.server.', ['http.route', 'http.request.method', 'http.response.status_code', 'error.type']],
  [
    'http.client.',
    ['http.request.method', 'http.response.status_code', 'server.address', 'error.type'],
  ],
  [
    'db.client.',
    ['db.system', 'db.operation.name', 'db.collection.name', 'server.address', 'error.type', 'state', 'pool.name'],
  ],
  ['messaging.', ['messaging.system', 'messaging.destination.name', 'messaging.operation.name', 'error.type']],
  ['rpc.', ['rpc.system', 'rpc.service', 'rpc.method', 'rpc.grpc.status_code']],
  ['ghostwire.job.', ['job', 'outcome']],
  ['ghostwire.heartbeat', ['job', 'worker', 'queue']],
  // Collector docker_stats receiver: the container comes from the resource.
  ['container.', ['container.name', 'direction', 'operation', 'state']],
  // Collector hostmetrics receiver: per-CPU and per-device series are summed.
  ['system.', ['host.name', 'state', 'direction', 'mountpoint', 'type']],
  ['process.', ['state', 'type', 'direction']],
];

/** Resource attributes copied onto points of these families (so containers and hosts can be told apart). */
const RESOURCE_KEYS: Array<[prefix: string, keys: string[]]> = [
  ['container.', ['container.name']],
  ['system.', ['host.name']],
];

/** Never kept on any series: unbounded or personal. */
const DENIED = /(^|\.)(url|full|target|path|query|ip|peer\.ip|user_agent|useragent|email|session|token|password|cookie|uuid)(\.|$)|(^|\.)(user|enduser|client)\.|\.id$|^id$|address\.ip|sock\./i;

/** Families without a rule keep up to this many attributes that pass DENIED. */
const DEFAULT_KEYS_KEPT = 6;

export type SeriesAttributes = Record<string, string | number | boolean>;

function rename(attrs: Attributes): Attributes {
  const out: Attributes = {};
  for (const [key, value] of Object.entries(attrs)) {
    const name = ATTRIBUTE_RENAMES[key] ?? key;
    // A current name wins over the older one when both are present.
    if (name !== key && name in attrs) continue;
    out[name] = value;
  }
  return out;
}

function scalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string') return value ? value.slice(0, LIMITS.seriesValueLength) : undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

/** The stored name for a metric (current semantic-convention name, capped). */
export function canonicalMetricName(name: string): string {
  return (METRIC_RENAMES[name] ?? name).slice(0, LIMITS.metricNameLength);
}

function rule<T>(table: Array<[string, T]>, metric: string): T | undefined {
  return table.find(([prefix]) => metric === prefix || metric.startsWith(prefix))?.[1];
}

/**
 * The attribute set a point is stored under: only the keys its family keeps (plus the resource's
 * container or host name for Collector metrics), values capped.
 */
export function seriesAttributes(
  metric: string,
  pointAttrs: Attributes,
  resourceAttrs: Attributes,
): SeriesAttributes {
  const attrs = rename(pointAttrs);
  const out: SeriesAttributes = {};

  for (const key of rule(RESOURCE_KEYS, metric) ?? []) {
    const value = scalar(attrs[key] ?? resourceAttrs[key]);
    if (value !== undefined) out[key] = value;
  }

  const keys = rule(SERIES_KEYS, metric);

  if (keys) {
    for (const key of keys) {
      if (key in out) continue;
      const value = scalar(attrs[key]);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }

  for (const key of Object.keys(attrs).sort()) {
    if (Object.keys(out).length >= DEFAULT_KEYS_KEPT) break;
    if (DENIED.test(key)) continue;
    const value = scalar(attrs[key]);
    if (value !== undefined) out[key] = value;
  }

  return out;
}

/** A short stable hash of a series' attribute set (and anything else that must split series). */
export function hashKey(value: unknown, length = 16): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, length);
}

// ---------------------------------------------------------------------------------------------
// Cardinality limits, per process. Next.js loads a module once per bundle, so the state lives on
// globalThis (like the log counters). With several app containers each one applies its own limit.
// ---------------------------------------------------------------------------------------------

export const MAX_SERIES_PER_METRIC = 500;
export const MAX_METRICS_PER_WEBSITE = 400;
const FORGET_AFTER_MS = 2 * 60 * 60 * 1000;
export const OVERFLOW_ATTRIBUTES: SeriesAttributes = { 'otel.metric.overflow': true };

interface CardinalityState {
  series: Map<string, Map<string, number>>;
  metrics: Map<string, Map<string, number>>;
  sweptAt: number;
}

const STATE = Symbol.for('ghostwire.otlp.cardinality');

function state(): CardinalityState {
  const store = globalThis as unknown as Record<symbol, CardinalityState | undefined>;
  store[STATE] ??= { series: new Map(), metrics: new Map(), sweptAt: Date.now() };
  return store[STATE]!;
}

function sweep(now: number) {
  const s = state();
  if (now - s.sweptAt < FORGET_AFTER_MS / 4) return;
  s.sweptAt = now;
  for (const map of [s.series, s.metrics]) {
    for (const [key, seen] of map) {
      for (const [item, at] of seen) if (now - at > FORGET_AFTER_MS) seen.delete(item);
      if (!seen.size) map.delete(key);
    }
  }
}

/** Whether this website may store another metric name (false once it has too many). */
export function admitMetric(websiteId: string, metric: string, now = Date.now()): boolean {
  sweep(now);
  const s = state();
  let seen = s.metrics.get(websiteId);
  if (!seen) s.metrics.set(websiteId, (seen = new Map()));
  if (!seen.has(metric) && seen.size >= MAX_METRICS_PER_WEBSITE) return false;
  seen.set(metric, now);
  return true;
}

/**
 * The attribute set to store: the given one while the metric has room, otherwise (for a set not
 * seen recently) the overflow set.
 */
export function limitSeries(
  scope: string,
  attrsHash: string,
  attrs: SeriesAttributes,
  now = Date.now(),
): { attrs: SeriesAttributes; attrsHash: string; overflow: boolean } {
  sweep(now);
  const s = state();
  let seen = s.series.get(scope);
  if (!seen) s.series.set(scope, (seen = new Map()));

  if (seen.has(attrsHash) || seen.size < MAX_SERIES_PER_METRIC) {
    seen.set(attrsHash, now);
    return { attrs, attrsHash, overflow: false };
  }

  return { attrs: OVERFLOW_ATTRIBUTES, attrsHash: hashKey(OVERFLOW_ATTRIBUTES), overflow: true };
}

/** Test helper: forget every limit. */
export function resetCardinality() {
  const store = globalThis as unknown as Record<symbol, CardinalityState | undefined>;
  store[STATE] = undefined;
}
