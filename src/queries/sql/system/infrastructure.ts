import { type InfraRow, summarizeInfrastructure } from '@/lib/monitoring/infrastructure';
import { bucketSql } from '@/lib/monitoring/resolution';
import { n, nOrNull, run, serviceFilter, type SystemFilters, windowFor } from './common';

/** The metrics the CPU and memory charts need, per bucket. */
const CHART_METRICS = [
  'container.cpu.utilization',
  'container.cpu.usage.total',
  'container.memory.usage.total',
  'container.memory.usage.limit',
  'container.memory.percent',
  'system.cpu.utilization',
  'system.cpu.time',
  'system.memory.utilization',
  'system.memory.usage',
];

function toRow(r: any, rowMinutes: number): InfraRow {
  return {
    metric: r.metric,
    attrs: r.attrs ?? {},
    sum: n(r.sum),
    count: n(r.count),
    max: nOrNull(r.max),
    last: nOrNull(r.last),
    minutes: n(r.buckets) * rowMinutes,
    lastAt: n(r.lastAt),
  };
}

const AGGREGATES = `
  metric, attrs, sum(sum) as "sum", sum(count) as "count", max(max) as "max",
  (array_agg(last order by bucket desc) filter (where last is not null))[1] as "last",
  count(distinct bucket) as "buckets", extract(epoch from max(bucket)) * 1000 as "lastAt"`;

/** Containers and hosts over the range, and CPU/memory per container and host over time. */
export async function getInfrastructure(websiteId: string, filters: SystemFilters) {
  const w = windowFor(filters);
  const params = { websiteId, ...filters, start: w.start, end: w.end };
  const where = `
    where website_id = {{websiteId::uuid}}
      and bucket >= {{start}} and bucket < {{end}} ${serviceFilter(filters)}`;

  const [rows, seriesRows] = await Promise.all([
    run<any>(
      `select ${AGGREGATES} from ${w.table} ${where}
        and (metric like 'container.%' or metric like 'system.%')
       group by metric, attrs_hash, attrs`,
      params,
      'getInfrastructure',
    ),
    run<any>(
      `select ${bucketSql('bucket', w.bucketSeconds)} as "t", ${AGGREGATES} from ${w.table} ${where}
        and metric in (${CHART_METRICS.map(m => `'${m}'`).join(', ')})
       group by 1, metric, attrs_hash, attrs`,
      params,
      'getInfrastructureSeries',
    ),
  ]);

  const summary = summarizeInfrastructure(rows.map(r => toRow(r, w.rowMinutes)));

  const byBucket = new Map<number, InfraRow[]>();
  for (const r of seriesRows) {
    const t = n(r.t);
    const list = byBucket.get(t) ?? [];
    list.push(toRow(r, w.rowMinutes));
    byBucket.set(t, list);
  }

  const points = [...byBucket]
    .sort(([a], [b]) => a - b)
    .map(([t, list]) => {
      const { containers, hosts } = summarizeInfrastructure(list);
      return {
        t,
        containers: Object.fromEntries(
          containers.map(c => [c.name, { cpu: c.cpuPercent, memory: c.memoryBytes, memoryPercent: c.memoryPercent }]),
        ),
        hosts: Object.fromEntries(hosts.map(h => [h.name, { cpu: h.cpuPercent, memory: h.memoryPercent }])),
      };
    });

  return { ...summary, series: { bucketSeconds: w.bucketSeconds, points } };
}
