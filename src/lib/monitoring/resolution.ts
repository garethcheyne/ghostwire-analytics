import { sqlInteger } from '@/lib/sql-safe';

/*
 * Which rollup table and bucket size a date range reads: minutes for up to two days, hours beyond
 * (the minutes are only kept 30 days by default). Buckets are aligned to the Unix epoch, so day
 * buckets are UTC days.
 */

export type RollupTable = 'monitor_metric_minute' | 'monitor_metric_hour';

export interface Resolution {
  table: RollupTable;
  /** Bucket size of the time series, in seconds. */
  bucketSeconds: number;
}

const HOUR = 3600;
const DAY = 24 * HOUR;

export function resolutionFor(startMs: number, endMs: number): Resolution {
  const span = Math.max(0, endMs - startMs) / 1000;

  if (span <= 3 * HOUR) return { table: 'monitor_metric_minute', bucketSeconds: 60 };
  if (span <= DAY) return { table: 'monitor_metric_minute', bucketSeconds: 300 };
  if (span <= 2 * DAY) return { table: 'monitor_metric_minute', bucketSeconds: 900 };
  if (span <= 14 * DAY) return { table: 'monitor_metric_hour', bucketSeconds: HOUR };
  return { table: 'monitor_metric_hour', bucketSeconds: DAY };
}

/** The table name, checked: it is written into SQL text. */
export function rollupTable(table: string): RollupTable {
  if (table !== 'monitor_metric_minute' && table !== 'monitor_metric_hour') {
    throw new Error(`Unknown rollup table: ${String(table).slice(0, 40)}`);
  }
  return table;
}

/** SQL for a column's time bucket of `seconds` (an integer, checked), as epoch milliseconds. */
export function bucketSql(column: string, seconds: number) {
  const n = sqlInteger(seconds, 60);
  if (!/^[a-z_.]+$/.test(column) || n < 1) throw new Error('Invalid bucket');
  return `(floor(extract(epoch from ${column}) / ${n}) * ${n} * 1000)::float8`;
}
