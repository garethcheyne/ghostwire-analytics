/*
 * Database and outside calls. Client spans give every call (db.system and server.address, the
 * sanitized statement, the duration); where a service also sends the client duration metrics
 * (http.client.request.duration, db.client.operation.duration) those are used for the counts and
 * latency, since they aren't affected by trace sampling.
 */
import { mergeBy } from '@/lib/monitoring/histograms';
import { bucketSql } from '@/lib/monitoring/resolution';
import { CLIENT_ERROR_SQL, n, nOrNull, run, serviceFilter, type SystemFilters, windowFor } from './common';

export interface DependencyRow {
  system: string;
  peer: string;
  calls: number;
  rate: number;
  errors: number;
  errorRate: number | null;
  avg: number | null;
  p50: number | null;
  p95: number | null;
  max: number | null;
  source: 'spans' | 'metrics';
}

export interface StatementRow {
  system: string;
  statement: string;
  calls: number;
  errors: number;
  avg: number;
  p95: number;
  max: number;
}

const CLIENT_METRICS = ['http.client.request.duration', 'db.client.operation.duration'];

export async function getDependencies(websiteId: string, filters: SystemFilters) {
  const w = windowFor(filters);
  const params = { websiteId, ...filters, start: w.start, end: w.end };

  const [spanRows, metricRows, statements, series] = await Promise.all([
    run<any>(
      `
      select coalesce(db_system, 'other') as "system", coalesce(peer, '') as "peer",
        count(*) as "calls", count(*) filter (where status = 2) as "errors",
        avg(duration_ms) as "avg", max(duration_ms) as "max",
        percentile_cont(0.5) within group (order by duration_ms) as "p50",
        percentile_cont(0.95) within group (order by duration_ms) as "p95"
      from monitor_span
      where website_id = {{websiteId::uuid}} and kind = 3
        and start_time >= {{startDate}} and start_time < {{endDate}}
        ${serviceFilter(filters)}
      group by 1, 2
      order by 3 desc
      limit 200
      `,
      params,
      'getDependencySpans',
    ),
    run<any>(
      `
      select case when metric = 'http.client.request.duration' then 'http'
               else coalesce(attrs->>'db.system', 'db') end as "system",
        coalesce(attrs->>'server.address', '') as "peer", bounds,
        sum(count) as "count", sum(sum) as "sum", min(min) as "min", max(max) as "max",
        monitor_sum_buckets(buckets) as "buckets",
        coalesce(sum(count) filter (where ${CLIENT_ERROR_SQL}), 0) as "errors"
      from ${w.table}
      where website_id = {{websiteId::uuid}} and metric in (${CLIENT_METRICS.map(m => `'${m}'`).join(', ')})
        and bucket >= {{start}} and bucket < {{end}}
        ${serviceFilter(filters)}
      group by 1, 2, bounds
      `,
      params,
      'getDependencyMetrics',
    ),
    run<any>(
      `
      select coalesce(db_system, 'other') as "system", db_statement as "statement",
        count(*) as "calls", count(*) filter (where status = 2) as "errors",
        avg(duration_ms) as "avg", max(duration_ms) as "max",
        percentile_cont(0.95) within group (order by duration_ms) as "p95"
      from monitor_span
      where website_id = {{websiteId::uuid}} and kind = 3 and db_statement is not null
        and start_time >= {{startDate}} and start_time < {{endDate}}
        ${serviceFilter(filters)}
      group by 1, 2
      order by 6 desc
      limit 25
      `,
      params,
      'getSlowStatements',
    ),
    run<any>(
      `
      select ${bucketSql('start_time', w.bucketSeconds)} as "t", count(*) as "calls",
        count(*) filter (where status = 2) as "errors",
        percentile_cont(0.95) within group (order by duration_ms) as "p95"
      from monitor_span
      where website_id = {{websiteId::uuid}} and kind = 3
        and start_time >= {{startDate}} and start_time < {{endDate}}
        ${serviceFilter(filters)}
      group by 1
      order by 1
      `,
      params,
      'getDependencySeries',
    ),
  ]);

  const rows = new Map<string, DependencyRow>();

  for (const r of spanRows) {
    const calls = n(r.calls);
    const errors = n(r.errors);
    rows.set(`${r.system}\u0000${r.peer}`, {
      system: r.system,
      peer: r.peer,
      calls,
      rate: calls / w.rangeMinutes,
      errors,
      errorRate: calls ? errors / calls : null,
      avg: nOrNull(r.avg),
      p50: nOrNull(r.p50),
      p95: nOrNull(r.p95),
      max: nOrNull(r.max),
      source: 'spans',
    });
  }

  for (const { first, stats } of mergeBy(metricRows, r => `${r.system}\u0000${r.peer}`)) {
    if (!stats.count) continue;
    rows.set(`${first.system}\u0000${first.peer}`, {
      system: first.system,
      peer: first.peer,
      calls: stats.count,
      rate: stats.count / w.rangeMinutes,
      errors: stats.errors,
      errorRate: stats.errors / stats.count,
      avg: stats.avg,
      p50: stats.p50,
      p95: stats.p95,
      max: stats.max,
      source: 'metrics',
    });
  }

  return {
    dependencies: [...rows.values()].sort((a, b) => b.calls - a.calls),
    statements: statements.map(
      (r): StatementRow => ({
        system: r.system,
        statement: r.statement,
        calls: n(r.calls),
        errors: n(r.errors),
        avg: n(r.avg),
        p95: n(r.p95),
        max: n(r.max),
      }),
    ),
    series: {
      bucketSeconds: w.bucketSeconds,
      points: series.map(r => ({ t: n(r.t), calls: n(r.calls), errors: n(r.errors), p95: nOrNull(r.p95) })),
    },
  };
}
