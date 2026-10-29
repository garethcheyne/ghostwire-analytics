import { EVENT_COLUMNS, FILTER_COLUMNS, SESSION_COLUMNS } from '@/lib/constants';

/*
 * Guards for the few values the ported queries write into SQL text instead of binding as
 * parameters (column names, LIMIT/OFFSET, time zones). The routes validate these with zod
 * already; these checks make sure nothing that skips a route (the MCP tools, a future caller)
 * can put arbitrary text into a query. Each throws rather than guessing.
 */

/** Whether `name` is one of the filter/metric names in FILTER_COLUMNS (not an Object.prototype key). */
export function isFilterColumn(name: string): name is keyof typeof FILTER_COLUMNS {
  return typeof name === 'string' && Object.hasOwn(FILTER_COLUMNS, name);
}

/** The SQL column for a filter name, or undefined when it isn't one. */
export function lookupFilterColumn(name: string): string | undefined {
  return isFilterColumn(name) ? FILTER_COLUMNS[name] : undefined;
}

/** The SQL column for a filter or metric name such as `path` or `browser`. */
export function filterColumn(name: string): string {
  if (!isFilterColumn(name)) {
    throw new Error(`Unknown column: ${String(name).slice(0, 50)}`);
  }

  return FILTER_COLUMNS[name];
}

/**
 * The column a metrics query groups by: the mapped column for names in FILTER_COLUMNS, the name
 * itself for the other metric types the routes accept (`screen`, `fullPath`), otherwise an error.
 */
export function metricColumn(type: string): string {
  if (isFilterColumn(type)) {
    return FILTER_COLUMNS[type];
  }

  if (SESSION_COLUMNS.includes(type) || EVENT_COLUMNS.includes(type)) {
    return type;
  }

  throw new Error(`Unknown metric type: ${String(type).slice(0, 50)}`);
}

/** A non-negative integer for LIMIT or OFFSET; `fallback` when the value is missing. */
export function sqlInteger(value: unknown, fallback: number): number {
  const number = value === undefined || value === null || value === '' ? fallback : Number(value);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`Not a valid row count: ${String(value).slice(0, 50)}`);
  }

  return number;
}

// IANA names (Europe/London, America/Argentina/Buenos_Aires, Etc/GMT+5) and offsets (+05:30).
const TIMEZONE = /^[A-Za-z0-9_+\-/:]{1,64}$/;

/** A time zone safe to quote in `at time zone '…'`; UTC when none is given. */
export function sqlTimezone(timezone?: string | null): string {
  if (!timezone || timezone.toLowerCase() === 'utc') {
    return 'UTC';
  }

  if (!TIMEZONE.test(timezone)) {
    throw new Error(`Invalid time zone: ${timezone.slice(0, 64)}`);
  }

  return timezone;
}
