import prisma from '@/lib/prisma';
import { type Resolution, resolutionFor, rollupTable } from '@/lib/monitoring/resolution';

/** What every System query takes: the website, the date range, and optionally one service. */
export interface SystemFilters {
  startDate: Date;
  endDate: Date;
  serviceId?: string;
}

export interface Window extends Resolution {
  /** Start of the range, moved back to the start of its hour when reading hourly rollups. */
  start: Date;
  end: Date;
  /** Minutes one rollup row covers (for turning totals into rates). */
  rowMinutes: number;
  /** Minutes in the date range. */
  rangeMinutes: number;
}

export function windowFor({ startDate, endDate }: SystemFilters): Window {
  const resolution = resolutionFor(startDate.getTime(), endDate.getTime());
  const hourly = resolution.table === 'monitor_metric_hour';
  const start = hourly ? new Date(Math.floor(startDate.getTime() / 3_600_000) * 3_600_000) : startDate;

  return {
    ...resolution,
    table: rollupTable(resolution.table),
    start,
    end: endDate,
    rowMinutes: hourly ? 60 : 1,
    rangeMinutes: Math.max(1, (endDate.getTime() - startDate.getTime()) / 60_000),
  };
}

/** `and <alias>service_id = …` when filtering to one service. */
export function serviceFilter(filters: SystemFilters, alias = '') {
  return filters.serviceId ? `and ${alias}service_id = {{serviceId::uuid}}` : '';
}

export function run<T>(sql: string, params: Record<string, unknown>, name: string): Promise<T[]> {
  return prisma.rawQuery(sql, params, name);
}

/** A server-side failure: a 5xx status, or an error type without a status (an exception). */
export const SERVER_ERROR_SQL = `(
  (attrs->>'http.response.status_code') ~ '^5[0-9][0-9]$'
  or (attrs ? 'error.type' and not attrs ? 'http.response.status_code')
)`;

/** A failed outside call: a 4xx/5xx answer or an error type. */
export const CLIENT_ERROR_SQL = `(
  (attrs->>'http.response.status_code') ~ '^[45][0-9][0-9]$' or attrs ? 'error.type'
)`;

export const n = (value: unknown) => (value === null || value === undefined ? 0 : Number(value));
export const nOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));
