/*
 * Flattens an ExportTraceServiceRequest (OTLP/JSON shape) into span rows. Pure: no database.
 * Attributes and events are copied with every count and length capped; database statements are
 * stored with their literals replaced by ? so values (and personal data) never land in the table.
 */
import { readService, type ServiceInfo } from './service';
import {
  type Attributes,
  type AttrValue,
  attrInt,
  attrString,
  cap,
  LIMITS,
  nanosToMs,
  readAttributes,
  toHexId,
  toNanos,
  toNumber,
} from './values';

export const MAX_SPANS_PER_REQUEST = 10_000;
export const MAX_EVENTS_PER_SPAN = 16;
export const MAX_ATTRIBUTES_JSON = 8 * 1024;
export const MAX_STACK_LENGTH = 8000;
export const MAX_STATEMENT_LENGTH = 1000;

export const SPAN_KIND = { unspecified: 0, internal: 1, server: 2, client: 3, producer: 4, consumer: 5 } as const;
export const SPAN_STATUS = { unset: 0, ok: 1, error: 2 } as const;

const KIND_NAMES: Record<string, number> = {
  SPAN_KIND_UNSPECIFIED: 0,
  SPAN_KIND_INTERNAL: 1,
  SPAN_KIND_SERVER: 2,
  SPAN_KIND_CLIENT: 3,
  SPAN_KIND_PRODUCER: 4,
  SPAN_KIND_CONSUMER: 5,
};
const STATUS_NAMES: Record<string, number> = { STATUS_CODE_UNSET: 0, STATUS_CODE_OK: 1, STATUS_CODE_ERROR: 2 };

export interface SpanEvent {
  name: string;
  timeMs: number;
  attributes: Attributes;
}

export interface SpanException {
  type: string;
  message: string;
  stack?: string;
  timeMs: number;
}

export interface SpanRow {
  service: ServiceInfo;
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: number;
  startMs: number;
  durationMs: number;
  status: number;
  statusMessage: string | null;
  isEntry: boolean;
  route: string | null;
  httpMethod: string | null;
  httpStatus: number | null;
  dbSystem: string | null;
  peer: string | null;
  dbStatement: string | null;
  attributes: Attributes;
  events: SpanEvent[];
  exceptions: SpanException[];
}

export interface FlattenSpansResult {
  spans: SpanRow[];
  rejected: number;
  services: Map<string, ServiceInfo>;
}

function enumValue(value: unknown, names: Record<string, number>, max: number) {
  if (typeof value === 'string' && value in names) return names[value];
  const n = Math.trunc(toNumber(value));
  return n >= 0 && n <= max ? n : 0;
}

/**
 * A query with its literal values replaced by ?: quoted strings, numbers, and (for JSON bodies such
 * as Elasticsearch queries) JSON strings. Whitespace is collapsed and the result capped.
 */
export function sanitizeStatement(statement: string | undefined): string | null {
  if (!statement) return null;

  let text = statement.slice(0, MAX_STATEMENT_LENGTH * 4);
  const json = /^\s*[[{]/.test(text);

  text = text.replace(/'(?:[^']|'')*'/g, '?');
  if (json) text = text.replace(/"(?:[^"\\]|\\.)*"\s*(?=[,}\]])/g, '?');
  // Numbers that aren't part of a name or a $1-style placeholder.
  text = text.replace(/(?<![\w$.])-?\d+(?:\.\d+)?(?:e[+-]?\d+)?(?![\w.])/gi, '?');
  text = text.replace(/\s+/g, ' ').trim();

  return text ? text.slice(0, MAX_STATEMENT_LENGTH) : null;
}

/** Attributes never kept on spans: credentials, and the raw statement (stored sanitized instead). */
const SECRET_KEY = /authorization|cookie|password|passwd|secret|token|api[._-]?key|^db\.statement$|^db\.query\.text$|^url\.query$/i;
const URL_KEYS = new Set(['url.full', 'http.url', 'http.target', 'url.path']);

/** URLs without their query string, which often carries tokens and personal data. */
function withoutQuery(value: AttrValue): AttrValue {
  return typeof value === 'string' ? value.split(/[?#]/)[0] : value;
}

/** Drops attributes (largest-last) until the JSON copy fits the budget. */
function boundedAttributes(attrs: Attributes): Attributes {
  const out: Attributes = {};
  let size = 2;

  for (const [key, raw] of Object.entries(attrs)) {
    if (SECRET_KEY.test(key)) continue;
    const value = URL_KEYS.has(key) ? withoutQuery(raw) : raw;
    const entry = JSON.stringify(key).length + JSON.stringify(value).length + 2;
    if (size + entry > MAX_ATTRIBUTES_JSON) continue;
    out[key] = value;
    size += entry;
  }

  return out;
}

function hostOf(url: string | undefined) {
  if (!url) return undefined;
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

/** The platform an error from this service is filed under in Errors. */
export function platformOf(language: string | null): string {
  switch (language) {
    case 'nodejs':
    case 'webjs':
      return 'node';
    case 'python':
      return 'python';
    case 'dotnet':
      return 'csharp';
    default:
      return 'other';
  }
}

export function flattenSpans(request: any, options: { maxSpans?: number } = {}): FlattenSpansResult {
  const maxSpans = options.maxSpans ?? MAX_SPANS_PER_REQUEST;
  const result: FlattenSpansResult = { spans: [], rejected: 0, services: new Map() };
  const resourceSpans = Array.isArray(request?.resourceSpans) ? request.resourceSpans : [];

  for (const rs of resourceSpans) {
    const service = readService(readAttributes(rs?.resource?.attributes));
    let used = false;

    for (const ss of Array.isArray(rs?.scopeSpans) ? rs.scopeSpans : []) {
      for (const span of Array.isArray(ss?.spans) ? ss.spans : []) {
        if (result.spans.length >= maxSpans) {
          result.rejected += 1;
          continue;
        }

        const traceId = toHexId(span?.traceId, 16);
        const spanId = toHexId(span?.spanId, 8);
        const start = toNanos(span?.startTimeUnixNano);
        const end = toNanos(span?.endTimeUnixNano);

        if (!traceId || !spanId || !start) {
          result.rejected += 1;
          continue;
        }

        const attrs = readAttributes(span.attributes);
        const kind = enumValue(span.kind, KIND_NAMES, 5);
        const parentSpanId = toHexId(span.parentSpanId, 8);
        const status = enumValue(span.status?.code, STATUS_NAMES, 2);
        const isEntry = !parentSpanId || kind === SPAN_KIND.server || kind === SPAN_KIND.consumer;
        const dbSystem =
          attrString(attrs, 'db.system', 'db.system.name', 'messaging.system', 'rpc.system') ??
          (kind === SPAN_KIND.client && attrString(attrs, 'http.request.method', 'http.method') ? 'http' : undefined);
        const url = attrString(attrs, 'url.full', 'http.url');

        const events: SpanEvent[] = [];
        const exceptions: SpanException[] = [];
        const rawEvents: any[] = Array.isArray(span.events) ? span.events : [];
        // Exceptions first, so the cap never drops them for log-style events.
        const ordered = [
          ...rawEvents.filter(e => e?.name === 'exception'),
          ...rawEvents.filter(e => e?.name !== 'exception'),
        ];

        for (const event of ordered.slice(0, MAX_EVENTS_PER_SPAN)) {
          const isException = event?.name === 'exception';
          const eventAttrs = readAttributes(event?.attributes, isException ? MAX_STACK_LENGTH : 500, 16);
          const timeMs = nanosToMs(toNanos(event?.timeUnixNano)) || nanosToMs(start);
          events.push({ name: cap(event?.name, 100) ?? 'event', timeMs, attributes: eventAttrs });

          if (isException) {
            exceptions.push({
              type: (attrString(eventAttrs, 'exception.type') ?? 'Error').slice(0, 200),
              message: (attrString(eventAttrs, 'exception.message') ?? '').slice(0, 1000),
              stack: attrString(eventAttrs, 'exception.stacktrace')?.slice(0, MAX_STACK_LENGTH),
              timeMs,
            });
          }
        }

        result.spans.push({
          service,
          traceId,
          spanId,
          parentSpanId,
          name: cap(span.name, LIMITS.spanNameLength) || '(unnamed)',
          kind,
          startMs: nanosToMs(start),
          durationMs: end > start ? Number(end - start) / 1e6 : 0,
          status,
          statusMessage: cap(span.status?.message, 500) || null,
          isEntry,
          route:
            (attrString(attrs, 'http.route', 'next.route') ?? (isEntry ? attrString(attrs, 'job') : undefined))?.slice(
              0,
              200,
            ) ?? null,
          httpMethod: attrString(attrs, 'http.request.method', 'http.method')?.slice(0, 16) ?? null,
          httpStatus: attrInt(attrs, 'http.response.status_code', 'http.status_code') ?? null,
          dbSystem: dbSystem?.slice(0, 50) ?? null,
          peer:
            (
              attrString(attrs, 'server.address', 'net.peer.name', 'peer.service', 'db.name', 'db.namespace') ??
              hostOf(url)
            )?.slice(0, 200) ?? null,
          dbStatement: sanitizeStatement(attrString(attrs, 'db.query.text', 'db.statement')),
          attributes: boundedAttributes(attrs),
          events,
          exceptions,
        });
        used = true;
      }
    }

    if (used || !result.services.has(service.key)) result.services.set(service.key, service);
  }

  return result;
}
