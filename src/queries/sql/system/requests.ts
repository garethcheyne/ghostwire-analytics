/*
 * Requests per endpoint, from the semantic-convention http.server.request.duration histogram
 * (older senders' http.server.duration is stored under the same name, in ms).
 */
import { type HistogramStats, mergeBy } from '@/lib/monitoring/histograms';
import { bucketSql } from '@/lib/monitoring/resolution';
import { run, SERVER_ERROR_SQL, serviceFilter, type SystemFilters, windowFor } from './common';

export const REQUEST_METRIC = 'http.server.request.duration';

export interface RequestStats extends Omit<HistogramStats, 'sum'> {
  /** Requests per minute over the range. */
  rate: number;
  errorRate: number | null;
}

export interface EndpointRow extends RequestStats {
  serviceId: string;
  route: string | null;
  method: string | null;
}

export interface RequestPoint {
  t: number;
  requests: number;
  errors: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

function stats(s: HistogramStats, rangeMinutes: number): RequestStats {
  const { sum: _sum, ...rest } = s;
  return { ...rest, rate: s.count / rangeMinutes, errorRate: s.count ? s.errors / s.count : null };
}

interface EndpointFilters extends SystemFilters {
  route?: string;
  method?: string;
}

function endpointFilter(filters: EndpointFilters) {
  return [
    serviceFilter(filters),
    filters.route !== undefined
      ? filters.route === ''
        ? `and not attrs ? 'http.route'`
        : `and attrs->>'http.route' = {{route}}`
      : '',
    filters.method ? `and attrs->>'http.request.method' = {{method}}` : '',
  ].join(' ');
}

/** Requests per service, route and method for the date range. */
export async function getEndpoints(websiteId: string, filters: EndpointFilters): Promise<EndpointRow[]> {
  const w = windowFor(filters);
  const rows = await run<any>(
    `
    select service_id as "serviceId", attrs->>'http.route' as "route",
      attrs->>'http.request.method' as "method", bounds,
      sum(count) as "count", sum(sum) as "sum", min(min) as "min", max(max) as "max",
      monitor_sum_buckets(buckets) as "buckets",
      coalesce(sum(count) filter (where ${SERVER_ERROR_SQL}), 0) as "errors"
    from ${w.table}
    where website_id = {{websiteId::uuid}} and metric = {{metric}}
      and bucket >= {{start}} and bucket < {{end}}
      ${endpointFilter(filters)}
    group by 1, 2, 3, bounds
    `,
    { websiteId, metric: REQUEST_METRIC, start: w.start, end: w.end, ...filters },
    'getEndpoints',
  );

  return mergeBy(rows, r => `${r.serviceId}\u0000${r.route ?? ''}\u0000${r.method ?? ''}`)
    .map(({ first, stats: s }) => ({
      serviceId: first.serviceId,
      route: first.route,
      method: first.method,
      ...stats(s, w.rangeMinutes),
    }))
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Totals per service (for the overview), keyed by service id, plus all services together. */
export async function getRequestTotals(websiteId: string, filters: SystemFilters) {
  const w = windowFor(filters);
  const rows = await run<any>(
    `
    select service_id as "serviceId", bounds,
      sum(count) as "count", sum(sum) as "sum", min(min) as "min", max(max) as "max",
      monitor_sum_buckets(buckets) as "buckets",
      coalesce(sum(count) filter (where ${SERVER_ERROR_SQL}), 0) as "errors"
    from ${w.table}
    where website_id = {{websiteId::uuid}} and metric = {{metric}}
      and bucket >= {{start}} and bucket < {{end}}
      ${serviceFilter(filters)}
    group by 1, bounds
    `,
    { websiteId, metric: REQUEST_METRIC, start: w.start, end: w.end, ...filters },
    'getRequestTotals',
  );

  const byService = new Map(mergeBy(rows, r => r.serviceId).map(g => [g.key, stats(g.stats, w.rangeMinutes)]));
  const [all] = mergeBy(rows, () => 'all');

  return { byService, total: all ? stats(all.stats, w.rangeMinutes) : null };
}

/** Requests, server errors and latency percentiles per time bucket. */
export async function getRequestSeries(websiteId: string, filters: EndpointFilters) {
  const w = windowFor(filters);
  const rows = await run<any>(
    `
    select ${bucketSql('bucket', w.bucketSeconds)} as "t", bounds,
      sum(count) as "count", sum(sum) as "sum", min(min) as "min", max(max) as "max",
      monitor_sum_buckets(buckets) as "buckets",
      coalesce(sum(count) filter (where ${SERVER_ERROR_SQL}), 0) as "errors"
    from ${w.table}
    where website_id = {{websiteId::uuid}} and metric = {{metric}}
      and bucket >= {{start}} and bucket < {{end}}
      ${endpointFilter(filters)}
    group by 1, bounds
    `,
    { websiteId, metric: REQUEST_METRIC, start: w.start, end: w.end, ...filters },
    'getRequestSeries',
  );

  const points: RequestPoint[] = mergeBy(rows, r => String(r.t))
    .map(({ first, stats: s }) => ({
      t: Number(first.t),
      requests: s.count,
      errors: s.errors,
      p50: s.p50,
      p95: s.p95,
      p99: s.p99,
    }))
    .sort((a, b) => a.t - b.t);

  return { bucketSeconds: w.bucketSeconds, points };
}
