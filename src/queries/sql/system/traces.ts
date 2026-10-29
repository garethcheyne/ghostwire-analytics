import { sqlInteger } from '@/lib/sql-safe';
import { run, serviceFilter, type SystemFilters } from './common';

export interface TraceSummary {
  traceId: string;
  spanId: string;
  serviceId: string;
  service: string;
  namespace: string;
  name: string;
  kind: number;
  startTime: string;
  durationMs: number;
  status: number;
  statusMessage: string | null;
  route: string | null;
  httpMethod: string | null;
  httpStatus: number | null;
  errorGroupId: string | null;
  spanCount: number;
}

export interface TraceFilters extends SystemFilters {
  route?: string;
  status?: 'error' | 'ok';
  minDurationMs?: number;
  search?: string;
  sort?: 'recent' | 'slowest';
  page?: number;
  pageSize?: number;
}

/**
 * Entry spans (each request a service handled, or job run) in the date range, newest or slowest
 * first, with the number of spans in their trace.
 */
export async function getTraces(websiteId: string, filters: TraceFilters) {
  const pageSize = Math.min(sqlInteger(filters.pageSize, 50), 200);
  const page = Math.max(sqlInteger(filters.page, 1), 1);
  const where = `
    where s.website_id = {{websiteId::uuid}} and s.is_entry
      and s.start_time >= {{startDate}} and s.start_time < {{endDate}}
      ${serviceFilter(filters, 's.')}
      ${filters.route ? 'and s.route = {{route}}' : ''}
      ${filters.status === 'error' ? 'and s.status = 2' : filters.status === 'ok' ? 'and s.status <> 2' : ''}
      ${filters.minDurationMs ? 'and s.duration_ms >= {{minDurationMs::float8}}' : ''}
      ${filters.search ? 'and s.name ilike {{search}}' : ''}`;
  const params = {
    websiteId,
    ...filters,
    search: filters.search ? `%${filters.search.replace(/[%_\\]/g, m => `\\${m}`)}%` : undefined,
  };

  const [rows, [{ count }]] = await Promise.all([
    run<any>(
      `
      select s.trace_id as "traceId", s.span_id as "spanId", s.service_id as "serviceId",
        svc.name as "service", svc.namespace, s.name, s.kind, s.start_time as "startTime",
        s.duration_ms as "durationMs", s.status, s.status_message as "statusMessage", s.route,
        s.http_method as "httpMethod", s.http_status as "httpStatus", s.error_group_id as "errorGroupId",
        (select count(*) from monitor_span c
          where c.website_id = s.website_id and c.trace_id = s.trace_id)::int as "spanCount"
      from monitor_span s
      join monitor_service svc on svc.service_id = s.service_id
      ${where}
      order by ${filters.sort === 'slowest' ? 's.duration_ms desc' : 's.start_time desc'}
      limit ${pageSize} offset ${(page - 1) * pageSize}
      `,
      params,
      'getTraces',
    ),
    run<{ count: number }>(
      `select count(*)::int as "count" from monitor_span s ${where}`,
      params,
      'getTracesCount',
    ),
  ]);

  return { data: rows as TraceSummary[], count, page, pageSize };
}

export interface TraceSpan {
  spanId: string;
  parentSpanId: string | null;
  serviceId: string;
  service: string;
  namespace: string;
  version: string | null;
  name: string;
  kind: number;
  startTime: string;
  durationMs: number;
  status: number;
  statusMessage: string | null;
  route: string | null;
  httpMethod: string | null;
  httpStatus: number | null;
  dbSystem: string | null;
  peer: string | null;
  dbStatement: string | null;
  attributes: Record<string, unknown> | null;
  events: { name: string; timeMs: number; attributes: Record<string, unknown> }[] | null;
  errorGroupId: string | null;
}

export const MAX_TRACE_SPANS = 2000;

/** Every span of one trace (up to MAX_TRACE_SPANS), in start order. */
export async function getTrace(websiteId: string, traceId: string): Promise<TraceSpan[]> {
  return run<TraceSpan>(
    `
    select s.span_id as "spanId", s.parent_span_id as "parentSpanId", s.service_id as "serviceId",
      svc.name as "service", svc.namespace, svc.version, s.name, s.kind, s.start_time as "startTime",
      s.duration_ms as "durationMs", s.status, s.status_message as "statusMessage", s.route,
      s.http_method as "httpMethod", s.http_status as "httpStatus", s.db_system as "dbSystem", s.peer,
      s.db_statement as "dbStatement", s.attributes, s.events, s.error_group_id as "errorGroupId"
    from monitor_span s
    join monitor_service svc on svc.service_id = s.service_id
    where s.website_id = {{websiteId::uuid}} and s.trace_id = {{traceId}}
    order by s.start_time, s.span_id
    limit ${MAX_TRACE_SPANS}
    `,
    { websiteId, traceId },
    'getTrace',
  );
}
