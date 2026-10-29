/*
 * Stores decoded OTLP requests for one website. Used by POST /v1/metrics and /v1/traces, and
 * in-process by self monitoring (src/lib/monitoring/self.ts), which skips HTTP and the key.
 *
 * Each request is a handful of batched statements, whatever its size: upsert the services, read
 * the previous totals of its cumulative streams, upsert the minute rollups and the new totals
 * (one transaction), or insert the spans. Nothing here makes a round trip per point or span.
 */
import { count as metric } from '@/lib/metrics';
import { log } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { applyDeltas, type CumulativeState } from './cumulative';
import { flattenMetrics } from './metrics';
import { rollup } from './rollup';
import type { ServiceInfo } from './service';
import { flattenSpans, platformOf, type SpanRow } from './spans';

export interface IngestResult {
  accepted: number;
  rejected: number;
  message?: string;
}

/** Inserts or touches the request's services; returns their ids by key. */
export async function upsertServices(
  websiteId: string,
  services: Iterable<ServiceInfo>,
  { metrics = false, heartbeats = new Set<string>() }: { metrics?: boolean; heartbeats?: Set<string> } = {},
): Promise<Map<string, string>> {
  const rows = [...services].map(s => ({
    namespace: s.namespace,
    name: s.name,
    version: s.version,
    environment: s.environment,
    language: s.language,
    heartbeat: heartbeats.has(s.key),
  }));
  if (!rows.length) return new Map();

  // A metrics export moves the moving average of the interval between exports (gaps under 5 s
  // are the same export split in two and don't count).
  const result: { id: string; namespace: string; name: string }[] = await prisma.client.$queryRawUnsafe(
    `
    insert into monitor_service as s (
      service_id, website_id, namespace, name, version, environment, language,
      first_seen, last_seen, last_metrics_at, last_heartbeat_at
    )
    select gen_random_uuid(), $1::uuid, r.namespace, r.name, r.version, r.environment, r.language,
      now(), now(), case when $3::boolean then now() end, case when r.heartbeat then now() end
    from jsonb_to_recordset($2::jsonb) as r(
      namespace text, name text, version text, environment text, language text, heartbeat boolean
    )
    on conflict (website_id, namespace, name) do update set
      last_seen = now(),
      version = coalesce(excluded.version, s.version),
      environment = coalesce(excluded.environment, s.environment),
      language = coalesce(excluded.language, s.language),
      last_heartbeat_at = coalesce(excluded.last_heartbeat_at, s.last_heartbeat_at),
      interval_seconds = case
        when excluded.last_metrics_at is null or s.last_metrics_at is null
          or now() - s.last_metrics_at < interval '5 seconds' then s.interval_seconds
        when s.interval_seconds is null
          then least(extract(epoch from now() - s.last_metrics_at), 3600)::int
        else round(s.interval_seconds * 0.7 + least(extract(epoch from now() - s.last_metrics_at), 3600) * 0.3)::int
      end,
      last_metrics_at = case
        when excluded.last_metrics_at is not null
          and (s.last_metrics_at is null or now() - s.last_metrics_at >= interval '5 seconds')
        then now() else s.last_metrics_at
      end
    returning service_id as "id", namespace, name
    `,
    websiteId,
    JSON.stringify(rows),
    metrics,
  );

  return new Map(result.map(r => [`${r.namespace}\u0000${r.name}`, r.id]));
}

const iso = (ms: number) => new Date(ms).toISOString();

export async function ingestMetrics(websiteId: string, request: any, now = Date.now()): Promise<IngestResult> {
  const flat = flattenMetrics(websiteId, request);

  if (flat.overflowed) metric('otlp.metrics.overflow', flat.overflowed);

  const serviceIds = await upsertServices(websiteId, flat.services.values(), {
    metrics: flat.points.length > 0,
    heartbeats: flat.heartbeats,
  });

  if (!flat.points.length) return { accepted: 0, rejected: flat.rejected };

  const streams = [...new Set(flat.points.filter(p => p.cumulative).map(p => p.stream))];

  await prisma.client.$transaction(async tx => {
    const states = new Map<string, CumulativeState>();

    if (streams.length) {
      const rows: { stream: string; startMs: number; value: number; count: bigint; buckets: bigint[] | null }[] =
        await tx.$queryRawUnsafe(
          `select stream, start_ms as "startMs", value, count, buckets
           from monitor_cumulative where website_id = $1::uuid and stream = any($2::text[])`,
          websiteId,
          streams,
        );
      for (const row of rows) {
        states.set(row.stream, {
          startMs: Number(row.startMs),
          value: Number(row.value),
          count: Number(row.count),
          buckets: (row.buckets ?? []).map(Number),
        });
      }
    }

    const { points, changed } = applyDeltas(flat.points, states, now);

    // Heartbeats sent as running totals: alive when the total went up since the last export.
    const beats = [
      ...new Set(
        points
          .filter(p => p.metric === 'ghostwire.heartbeat' && p.value > 0 && !flat.heartbeats.has(p.service.key))
          .map(p => serviceIds.get(p.service.key))
          .filter(Boolean),
      ),
    ];
    if (beats.length) {
      await tx.$executeRawUnsafe(
        `update monitor_service set last_heartbeat_at = now() where service_id = any($1::uuid[])`,
        beats,
      );
    }
    const rows = rollup(points).flatMap(row => {
      const serviceId = serviceIds.get(row.serviceKey);
      return serviceId
        ? [
            {
              website_id: websiteId,
              service_id: serviceId,
              metric: row.metric,
              attrs_hash: row.attrsHash,
              bucket: iso(row.bucket),
              kind: row.kind,
              unit: row.unit,
              attrs: row.attrs,
              count: Math.round(row.count),
              sum: row.sum,
              min: row.min,
              max: row.max,
              last: row.last,
              bounds: row.bounds,
              buckets: row.buckets.map(n => Math.round(n)),
            },
          ]
        : [];
    });

    if (rows.length) {
      await tx.$executeRawUnsafe(
        `
        insert into monitor_metric_minute as m (
          website_id, service_id, metric, attrs_hash, bucket, kind, unit, attrs,
          count, sum, min, max, last, bounds, buckets
        )
        select r.website_id, r.service_id, r.metric, r.attrs_hash, r.bucket, r.kind, r.unit, r.attrs,
          r.count, r.sum, r.min, r.max, r.last, r.bounds, r.buckets
        from jsonb_to_recordset($1::jsonb) as r(
          website_id uuid, service_id uuid, metric text, attrs_hash text, bucket timestamptz,
          kind smallint, unit text, attrs jsonb, count bigint, sum float8, min float8, max float8,
          last float8, bounds float8[], buckets bigint[]
        )
        on conflict (website_id, service_id, metric, attrs_hash, bucket) do update set
          count = m.count + excluded.count,
          sum = m.sum + excluded.sum,
          min = least(m.min, excluded.min),
          max = greatest(m.max, excluded.max),
          last = coalesce(excluded.last, m.last),
          buckets = monitor_array_add(m.buckets, excluded.buckets)
        `,
        JSON.stringify(rows),
      );
    }

    if (changed.size) {
      const stateRows = [...changed].map(([stream, s]) => ({
        stream,
        start_ms: s.startMs,
        value: s.value,
        count: Math.round(s.count),
        buckets: s.buckets.map(n => Math.round(n)),
      }));
      await tx.$executeRawUnsafe(
        `
        insert into monitor_cumulative as c (website_id, stream, start_ms, value, count, buckets, seen_at)
        select $1::uuid, r.stream, r.start_ms, r.value, r.count, r.buckets, now()
        from jsonb_to_recordset($2::jsonb) as r(stream text, start_ms float8, value float8, count bigint, buckets bigint[])
        on conflict (website_id, stream) do update set
          start_ms = excluded.start_ms, value = excluded.value, count = excluded.count,
          buckets = excluded.buckets, seen_at = now()
        `,
        websiteId,
        JSON.stringify(stateRows),
      );
    }
  });

  metric('otlp.metrics.points', flat.points.length);
  return {
    accepted: flat.points.length,
    rejected: flat.rejected,
    message: flat.rejected ? 'Some data points were over the limits or malformed.' : undefined,
  };
}

/** Spans to store, as recordset rows. */
function spanRecord(websiteId: string, serviceId: string, span: SpanRow) {
  return {
    website_id: websiteId,
    trace_id: span.traceId,
    span_id: span.spanId,
    parent_span_id: span.parentSpanId,
    service_id: serviceId,
    name: span.name,
    kind: span.kind,
    start_time: iso(span.startMs),
    duration_ms: span.durationMs,
    status: span.status,
    status_message: span.statusMessage,
    is_entry: span.isEntry,
    route: span.route,
    http_method: span.httpMethod,
    http_status: span.httpStatus,
    db_system: span.dbSystem,
    peer: span.peer,
    db_statement: span.dbStatement,
    attributes: span.attributes,
    events: span.events.length ? span.events : null,
  };
}

export interface TraceIngestResult extends IngestResult {
  /** Spans with recorded exceptions, for filing under Errors (after the response). */
  exceptions: SpanRow[];
}

export async function ingestTraces(websiteId: string, request: any): Promise<TraceIngestResult> {
  const flat = flattenSpans(request);
  const serviceIds = await upsertServices(websiteId, flat.services.values());
  const records = flat.spans.flatMap(span => {
    const serviceId = serviceIds.get(span.service.key);
    return serviceId ? [spanRecord(websiteId, serviceId, span)] : [];
  });

  // Large exports go in slices so one statement's JSON parameter stays moderate.
  for (let i = 0; i < records.length; i += 2000) {
    await prisma.client.$executeRawUnsafe(
      `
      insert into monitor_span (
        website_id, trace_id, span_id, parent_span_id, service_id, name, kind, start_time,
        duration_ms, status, status_message, is_entry, route, http_method, http_status, db_system,
        peer, db_statement, attributes, events
      )
      select r.website_id, r.trace_id, r.span_id, r.parent_span_id, r.service_id, r.name, r.kind,
        r.start_time, r.duration_ms, r.status, r.status_message, r.is_entry, r.route, r.http_method,
        r.http_status, r.db_system, r.peer, r.db_statement, r.attributes, r.events
      from jsonb_to_recordset($1::jsonb) as r(
        website_id uuid, trace_id text, span_id text, parent_span_id text, service_id uuid, name text,
        kind smallint, start_time timestamptz, duration_ms float8, status smallint, status_message text,
        is_entry boolean, route text, http_method text, http_status int, db_system text, peer text,
        db_statement text, attributes jsonb, events jsonb
      )
      on conflict (website_id, trace_id, span_id) do nothing
      `,
      JSON.stringify(records.slice(i, i + 2000)),
    );
  }

  metric('otlp.traces.spans', records.length);
  return {
    accepted: records.length,
    rejected: flat.rejected,
    message: flat.rejected ? 'Some spans were over the limits or malformed.' : undefined,
    exceptions: flat.spans.filter(s => s.exceptions.length),
  };
}

/** Exceptions filed under Errors per request; the rest are still on their spans. */
export const MAX_ERRORS_PER_REQUEST = 20;

/**
 * Files exceptions recorded on spans under the website's Errors (when error reporting is on),
 * linked both ways: the error event's context has the trace, the span the error group. Never throws.
 */
export async function fileSpanExceptions(
  websiteId: string,
  spans: SpanRow[],
  allow: (websiteId: string) => Promise<boolean>,
) {
  if (!spans.length) return;

  try {
    const website = await prisma.client.website.findUnique({
      where: { id: websiteId },
      select: { errorsEnabled: true },
    });
    if (!website?.errorsEnabled) return;

    const [{ saveError }, { afterResponse, notifyErrorSaved }] = await Promise.all([
      import('@/queries/sql/errors/saveError'),
      import('@/lib/alerts'),
    ]);
    let filed = 0;

    for (const span of spans) {
      for (const exception of span.exceptions) {
        if (filed >= MAX_ERRORS_PER_REQUEST || !(await allow(websiteId))) return;
        filed += 1;

        const saved = await saveError({
          websiteId,
          source: 'server',
          platform: platformOf(span.service.language) as any,
          type: exception.type,
          message: exception.message || span.statusMessage || span.name,
          stack: exception.stack,
          urlPath: span.route,
          environment: span.service.environment,
          release: span.service.version,
          context: {
            handled: false,
            trace: { traceId: span.traceId, spanId: span.spanId },
            service: { namespace: span.service.namespace, name: span.service.name },
            span: span.name,
            request: span.httpMethod ? { method: span.httpMethod, path: span.route } : undefined,
          },
          createdAt: new Date(exception.timeMs),
        });

        await prisma.client.$executeRawUnsafe(
          `update monitor_span set error_group_id = $4::uuid
           where website_id = $1::uuid and trace_id = $2 and span_id = $3`,
          websiteId,
          span.traceId,
          span.spanId,
          saved.groupId,
        );

        afterResponse(() =>
          notifyErrorSaved({
            ...saved,
            websiteId,
            source: 'server',
            urlPath: span.route,
            release: span.service.version,
            environment: span.service.environment,
          }),
        );
      }
    }
  } catch (error) {
    log.error('otlp.exceptions_failed', { websiteId, error });
  }
}
