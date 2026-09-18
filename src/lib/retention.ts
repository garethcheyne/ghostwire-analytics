/*
 * Deletes raw replay, heatmap and error data older than the configured number of days.
 * Off unless configured: nothing is ever deleted until one of these is set (days, 0 = keep):
 *   DATA_RETENTION_DAYS       default for all three
 *   REPLAY_RETENTION_DAYS     replay recordings (saved replays are always kept)
 *   HEATMAP_RETENTION_DAYS    heatmap clicks and scrolls
 *   ERROR_RETENTION_DAYS      error events (groups go once empty, unless ignored)
 * Page views, events and sessions aren't touched.
 */
import prisma from '@/lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 5000;
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

export interface RetentionDays {
  replays: number;
  heatmaps: number;
  errors: number;
}

function days(value: string | undefined, fallback: number) {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function getRetentionDays(env: Record<string, string | undefined> = process.env) {
  const fallback = days(env.DATA_RETENTION_DAYS, 0);

  return {
    replays: days(env.REPLAY_RETENTION_DAYS, fallback),
    heatmaps: days(env.HEATMAP_RETENTION_DAYS, fallback),
    errors: days(env.ERROR_RETENTION_DAYS, fallback),
  } satisfies RetentionDays;
}

/** Runs a batched delete until it removes nothing more; returns the rows removed. */
async function deleteInBatches(run: () => Promise<number>) {
  let total = 0;

  for (;;) {
    const deleted = await run();
    total += deleted;
    if (deleted < BATCH_SIZE) return total;
  }
}

export async function runRetention(
  retention: RetentionDays = getRetentionDays(),
  now = new Date(),
) {
  const client = prisma.client;
  const cutoff = (numDays: number) => new Date(now.getTime() - numDays * DAY_MS);
  const result = { replays: 0, heatmaps: 0, errorEvents: 0, errorGroups: 0 };

  if (retention.replays) {
    const before = cutoff(retention.replays);
    result.replays = await deleteInBatches(
      () =>
        client.$executeRaw`
        delete from session_replay where replay_id in (
          select r.replay_id from session_replay r
          where r.created_at < ${before}
            and not exists (
              select 1 from session_replay_saved s
              where s.website_id = r.website_id and s.visit_id = r.visit_id
            )
          limit ${BATCH_SIZE}
        )`,
    );
  }

  if (retention.heatmaps) {
    const before = cutoff(retention.heatmaps);
    result.heatmaps = await deleteInBatches(
      () =>
        client.$executeRaw`
        delete from heatmap_event where heatmap_event_id in (
          select heatmap_event_id from heatmap_event
          where created_at < ${before}
          limit ${BATCH_SIZE}
        )`,
    );
  }

  if (retention.errors) {
    const before = cutoff(retention.errors);
    result.errorEvents = await deleteInBatches(
      () =>
        client.$executeRaw`
        delete from error_event where error_event_id in (
          select error_event_id from error_event
          where created_at < ${before}
          limit ${BATCH_SIZE}
        )`,
    );
    // Ignored groups stay, so an ignored error doesn't come back as new.
    result.errorGroups = await client.$executeRaw`
      delete from error_group g
      where g.last_seen < ${before}
        and g.status <> 'ignored'
        and not exists (select 1 from error_event e where e.error_group_id = g.error_group_id)`;
  }

  return result;
}

let started = false;

/** Schedules retention every 6 hours (first run 5 minutes after start), when configured. */
export function startRetentionSchedule() {
  const retention = getRetentionDays();
  if (started || (!retention.replays && !retention.heatmaps && !retention.errors)) return;
  started = true;

  const run = async () => {
    try {
      const removed = await runRetention(retention);
      if (Object.values(removed).some(Boolean)) {
        console.log('Data retention removed', removed);
      }
    } catch (error) {
      console.error('Data retention failed:', error);
    }
  };

  setTimeout(() => {
    void run();
    setInterval(run, INTERVAL_MS).unref?.();
  }, FIRST_RUN_DELAY_MS).unref?.();
}
