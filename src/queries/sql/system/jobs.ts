/*
 * Background jobs, from ghostwire.job.runs (counter, attributes job and outcome) and
 * ghostwire.job.duration (histogram, same attributes), plus the latest failure from the job's
 * spans (named "job <name>", attribute job).
 */
import { mergeBy } from '@/lib/monitoring/histograms';
import { bucketSql } from '@/lib/monitoring/resolution';
import { n, run, serviceFilter, type SystemFilters, windowFor } from './common';

export interface JobRow {
  serviceId: string;
  job: string;
  runs: number;
  failures: number;
  failureRate: number | null;
  avg: number | null;
  p95: number | null;
  max: number | null;
  lastRunAt: number | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
}

const FAILED = `coalesce(attrs->>'outcome', 'ok') <> 'ok'`;

export async function getJobs(websiteId: string, filters: SystemFilters) {
  const w = windowFor(filters);
  const params = { websiteId, ...filters, start: w.start, end: w.end };

  const [runs, durations, failures, series] = await Promise.all([
    run<any>(
      `
      select service_id as "serviceId", attrs->>'job' as "job",
        sum(sum) as "runs", coalesce(sum(sum) filter (where ${FAILED}), 0) as "failures",
        extract(epoch from max(bucket) filter (where sum > 0)) * 1000 as "lastRunAt"
      from ${w.table}
      where website_id = {{websiteId::uuid}} and metric = 'ghostwire.job.runs'
        and bucket >= {{start}} and bucket < {{end}} ${serviceFilter(filters)}
      group by 1, 2
      `,
      params,
      'getJobRuns',
    ),
    run<any>(
      `
      select service_id as "serviceId", attrs->>'job' as "job", bounds,
        sum(count) as "count", sum(sum) as "sum", min(min) as "min", max(max) as "max",
        monitor_sum_buckets(buckets) as "buckets",
        coalesce(sum(count) filter (where ${FAILED}), 0) as "errors",
        extract(epoch from max(bucket) filter (where count > 0)) * 1000 as "lastRunAt"
      from ${w.table}
      where website_id = {{websiteId::uuid}} and metric = 'ghostwire.job.duration'
        and bucket >= {{start}} and bucket < {{end}} ${serviceFilter(filters)}
      group by 1, 2, bounds
      `,
      params,
      'getJobDurations',
    ),
    run<any>(
      `
      select distinct on (service_id, attributes->>'job')
        service_id as "serviceId", attributes->>'job' as "job",
        start_time as "at", coalesce(status_message, name) as "message"
      from monitor_span
      where website_id = {{websiteId::uuid}} and is_entry and status = 2
        and attributes ? 'job'
        and start_time >= {{startDate}} and start_time < {{endDate}} ${serviceFilter(filters)}
      order by service_id, attributes->>'job', start_time desc
      `,
      params,
      'getJobFailures',
    ),
    run<any>(
      `
      select ${bucketSql('bucket', w.bucketSeconds)} as "t",
        sum(sum) as "runs", coalesce(sum(sum) filter (where ${FAILED}), 0) as "failures"
      from ${w.table}
      where website_id = {{websiteId::uuid}} and metric = 'ghostwire.job.runs'
        and bucket >= {{start}} and bucket < {{end}} ${serviceFilter(filters)}
      group by 1
      order by 1
      `,
      params,
      'getJobSeries',
    ),
  ]);

  const key = (r: { serviceId: string; job: string | null }) => `${r.serviceId}\u0000${r.job ?? ''}`;
  const jobs = new Map<string, JobRow>();
  const blank = (serviceId: string, job: string): JobRow => ({
    serviceId,
    job,
    runs: 0,
    failures: 0,
    failureRate: null,
    avg: null,
    p95: null,
    max: null,
    lastRunAt: null,
    lastFailureAt: null,
    lastFailure: null,
  });

  for (const r of runs) {
    const row = blank(r.serviceId, r.job ?? '');
    row.runs = n(r.runs);
    row.failures = n(r.failures);
    row.lastRunAt = r.lastRunAt === null ? null : n(r.lastRunAt);
    jobs.set(key(r), row);
  }

  for (const { first, stats } of mergeBy(durations, key)) {
    const row = jobs.get(key(first)) ?? blank(first.serviceId, first.job ?? '');
    // Without the runs counter, the duration histogram counts the runs.
    if (!jobs.has(key(first))) {
      row.runs = stats.count;
      row.failures = stats.errors;
    }
    row.avg = stats.avg;
    row.p95 = stats.p95;
    row.max = stats.max;
    const last = Math.max(
      ...durations.filter(d => key(d) === key(first) && d.lastRunAt !== null).map(d => n(d.lastRunAt)),
    );
    if (Number.isFinite(last)) row.lastRunAt = Math.max(row.lastRunAt ?? 0, last);
    jobs.set(key(first), row);
  }

  for (const f of failures) {
    const row = jobs.get(key(f));
    if (row) {
      row.lastFailureAt = f.at;
      row.lastFailure = f.message;
    }
  }

  for (const row of jobs.values()) row.failureRate = row.runs ? row.failures / row.runs : null;

  return {
    jobs: [...jobs.values()].filter(j => j.job).sort((a, b) => a.job.localeCompare(b.job)),
    series: {
      bucketSeconds: w.bucketSeconds,
      points: series.map(r => ({ t: n(r.t), runs: n(r.runs), failures: n(r.failures) })),
    },
  };
}
