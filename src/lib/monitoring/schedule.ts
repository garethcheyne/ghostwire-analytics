/*
 * Background work for system monitoring, started from instrumentation:
 *   - every 5 minutes, minute rollups become hourly rollups (the current and previous hours are
 *     recomputed, so the hourly table is never more than a few minutes behind; idempotent, so
 *     several app containers can run it);
 *   - every hour, data past each website's retention is deleted in batches: spans
 *     (monitor_span_days, default 7), minute rollups (30), hourly rollups (396, about 13 months),
 *     plus stale cumulative totals and services not heard from within the hourly retention.
 */
import { log } from '@/lib/logger';
import prisma from '@/lib/prisma';

const ROLLUP_EVERY_MS = 5 * 60 * 1000;
const RETENTION_EVERY_MS = 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
/** After downtime, hours are caught up from the watermark, but never further back than this. */
const MAX_CATCH_UP_MS = 7 * 24 * HOUR_MS;
const WATERMARK_KEY = 'monitor_hour_rollup';
const BATCH_SIZE = 5000;
/** Totals of cumulative streams not seen for this long are forgotten (the next point is a new baseline). */
const CUMULATIVE_TTL_DAYS = 2;

export const RETENTION_DEFAULTS = { spanDays: 7, minuteDays: 30, hourDays: 396 } as const;
export const RETENTION_MAX_DAYS = 3650;

const floorHour = (ms: number) => Math.floor(ms / HOUR_MS) * HOUR_MS;

/** The window of minute rows to (re)roll into hours. */
export function rollupWindow(now: number, watermark: number | null) {
  const from = Math.max(floorHour(Math.min(watermark ?? now, now - HOUR_MS)), floorHour(now - MAX_CATCH_UP_MS));
  return { from: new Date(from), to: new Date(now), watermark: new Date(floorHour(now)) };
}

export async function rollupHours(now = Date.now()) {
  const client = prisma.client;
  const stored = await client.appSetting.findUnique({ where: { key: WATERMARK_KEY } });
  const watermark = stored ? Date.parse(stored.value) : null;
  const { from, to, watermark: next } = rollupWindow(now, Number.isFinite(watermark) ? watermark : null);

  const rows = await client.$executeRawUnsafe(
    `
    insert into monitor_metric_hour as h (
      website_id, service_id, metric, attrs_hash, bucket, kind, unit, attrs,
      count, sum, min, max, last, bounds, buckets
    )
    select website_id, service_id, metric, attrs_hash, date_trunc('hour', bucket, 'UTC'),
      min(kind), max(unit), (array_agg(attrs order by bucket desc))[1],
      sum(count), sum(sum), min(min), max(max),
      (array_agg(last order by bucket desc) filter (where last is not null))[1],
      -- One series always has the same bounds (they are part of attrs_hash).
      max(bounds),
      monitor_sum_buckets(buckets order by bucket)
    from monitor_metric_minute
    where bucket >= $1 and bucket < $2
    group by website_id, service_id, metric, attrs_hash, date_trunc('hour', bucket, 'UTC')
    on conflict (website_id, service_id, metric, attrs_hash, bucket) do update set
      kind = excluded.kind, unit = excluded.unit, attrs = excluded.attrs, count = excluded.count,
      sum = excluded.sum, min = excluded.min, max = excluded.max, last = excluded.last,
      bounds = excluded.bounds, buckets = excluded.buckets
    `,
    from,
    to,
  );

  await client.appSetting.upsert({
    where: { key: WATERMARK_KEY },
    create: { key: WATERMARK_KEY, value: next.toISOString() },
    update: { value: next.toISOString() },
  });

  return rows;
}

/** Runs a batched delete until it removes fewer than a batch. */
async function deleteInBatches(sql: string) {
  let total = 0;
  for (;;) {
    const deleted = await prisma.client.$executeRawUnsafe(sql, BATCH_SIZE);
    total += deleted;
    if (deleted < BATCH_SIZE) return total;
  }
}

/** Deletes monitoring data past each website's retention. Returns the rows removed per table. */
export async function runMonitoringRetention() {
  // Each statement picks a batch through the website's own setting, then deletes it by ctid.
  const spans = await deleteInBatches(`
    delete from monitor_span where ctid = any(array(
      select s.ctid from monitor_span s join website w on w.website_id = s.website_id
      where s.start_time < now() - make_interval(days => w.monitor_span_days)
      limit $1))`);
  const minutes = await deleteInBatches(`
    delete from monitor_metric_minute where ctid = any(array(
      select m.ctid from monitor_metric_minute m join website w on w.website_id = m.website_id
      where m.bucket < now() - make_interval(days => w.monitor_minute_days)
      limit $1))`);
  const hours = await deleteInBatches(`
    delete from monitor_metric_hour where ctid = any(array(
      select h.ctid from monitor_metric_hour h join website w on w.website_id = h.website_id
      where h.bucket < now() - make_interval(days => w.monitor_hour_days)
      limit $1))`);
  const cumulative = await deleteInBatches(`
    delete from monitor_cumulative where ctid = any(array(
      select ctid from monitor_cumulative
      where seen_at < now() - interval '${CUMULATIVE_TTL_DAYS} days'
      limit $1))`);
  const services = await prisma.client.$executeRawUnsafe(`
    delete from monitor_service s using website w
    where w.website_id = s.website_id
      and s.last_seen < now() - make_interval(days => w.monitor_hour_days)`);

  return { spans, minutes, hours, cumulative, services };
}

const STARTED = Symbol.for('ghostwire.monitoring.schedule');

export function startMonitoringSchedule() {
  const store = globalThis as unknown as Record<symbol, boolean | undefined>;
  if (store[STARTED]) return;
  store[STARTED] = true;

  const rollup = async () => {
    try {
      await rollupHours();
    } catch (error) {
      log.error('monitoring.rollup_failed', { error });
    }
  };

  const retention = async () => {
    try {
      const removed = await runMonitoringRetention();
      if (Object.values(removed).some(Boolean)) log.info('monitoring.retention_removed', removed);
    } catch (error) {
      log.error('monitoring.retention_failed', { error });
    }
  };

  setTimeout(() => {
    void rollup().then(retention);
    setInterval(rollup, ROLLUP_EVERY_MS).unref?.();
    setInterval(retention, RETENTION_EVERY_MS).unref?.();
  }, FIRST_RUN_DELAY_MS).unref?.();
}
