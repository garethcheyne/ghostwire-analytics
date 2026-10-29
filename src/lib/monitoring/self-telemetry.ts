/*
 * OpenTelemetry for this Analytics instance itself (self monitoring, src/lib/monitoring/self.ts):
 * the Next.js server's requests, its Prisma queries and outbound fetch() calls, as traces and
 * metrics, handed to the OTLP ingest code in process instead of an OTLP/HTTP exporter.
 *
 * It follows the suite's shared Node setup (ghostwire-suite/ui/registry/ghostwire/analytics/
 * telemetry.ts: delta temporality, undici (fetch) and database instrumentation, a sampler that records
 * nothing while monitoring is off, exports that never throw into the app) with two differences:
 *   - exporters serialize with the SDK's OTLP serializer and call ingestSignal() directly, so
 *     there is no URL or key and no HTTP round trip (and no feedback: the ingest runs with tracing
 *     suppressed, and /v1/* requests are never traced);
 *   - incoming requests come from Next.js's own spans (it traces every request once a tracer
 *     provider is registered, with the route pattern in http.route), and http.server.request.duration
 *     is recorded from them. The http module instrumentation isn't used: Next already covers
 *     incoming requests, outgoing fetch() goes through undici, and in the standalone build it
 *     can't load (its forwarded-parse dependency isn't traced into the image).
 *
 * Registered once from instrumentation.ts (Node.js runtime). OTEL_SDK_DISABLED=true skips it.
 */
import {
  type Attributes,
  type Context,
  context,
  type Histogram,
  type Link,
  metrics,
  propagation,
  ROOT_CONTEXT,
  type SpanKind,
  trace,
} from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  CompositePropagator,
  type ExportResult,
  ExportResultCode,
  suppressTracing,
  W3CBaggagePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { JsonMetricsSerializer, JsonTraceSerializer } from '@opentelemetry/otlp-transformer';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  AggregationTemporality,
  InstrumentType,
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  type ReadableSpan,
  type Sampler,
  SamplingDecision,
  type SamplingResult,
  type Span,
  type SpanExporter,
  type SpanProcessor,
  TracerProvider,
} from '@opentelemetry/sdk-trace';
import { hostname } from 'node:os';
import { log } from '@/lib/logger';
import { decodeRequest, type OtlpSignal } from '@/lib/otlp/decode';
import { getSelfMonitoring, peekSelfMonitoring } from './self';

export const SELF_SERVICE = { name: 'web', namespace: 'ghostwire-analytics' } as const;

/** Never traced: the OTLP receivers (they'd echo), health checks and static files. */
export const IGNORED_PATHS = ['/v1/', '/api/heartbeat', '/_next/static/', '/_next/image', '/favicon', '/sw.js'];

const INSTANCE = Symbol.for('ghostwire.self-telemetry');
const WARN_EVERY_MS = 10 * 60_000;
const REQUEST_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10];

const basePath = process.env.BASE_PATH || '';

export function isIgnoredPath(path: unknown) {
  if (typeof path !== 'string') return false;
  const local = basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
  return IGNORED_PATHS.some(prefix => local.startsWith(prefix));
}

let lastWarning = 0;
function warn(what: string, error: unknown) {
  if (Date.now() - lastWarning < WARN_EVERY_MS) return;
  lastWarning = Date.now();
  log.warn('self_monitoring.export_failed', { what, error });
}

/** Serialized OTLP/JSON → the ingest code, with tracing suppressed so storing never traces itself. */
async function deliver(signal: OtlpSignal, bytes: Uint8Array | undefined) {
  const { enabled, websiteId } = await getSelfMonitoring();
  if (!enabled || !websiteId || !bytes) return;

  const { ingestSignal } = await import('@/lib/otlp/http');
  await context.with(suppressTracing(ROOT_CONTEXT), () =>
    ingestSignal(websiteId, signal, decodeRequest(signal, 'json', bytes)),
  );
}

class InProcessSpanExporter implements SpanExporter {
  export(spans: ReadableSpan[], done: (result: ExportResult) => void) {
    deliver('traces', JsonTraceSerializer.serializeRequest(spans)).then(
      () => done({ code: ExportResultCode.SUCCESS }),
      error => {
        warn('traces', error);
        done({ code: ExportResultCode.FAILED });
      },
    );
  }

  async shutdown() {}
  async forceFlush() {}
}

class InProcessMetricExporter implements PushMetricExporter {
  export(data: ResourceMetrics, done: (result: ExportResult) => void) {
    deliver('metrics', JsonMetricsSerializer.serializeRequest(data)).then(
      () => done({ code: ExportResultCode.SUCCESS }),
      error => {
        warn('metrics', error);
        done({ code: ExportResultCode.FAILED });
      },
    );
  }

  /** Delta for counters and histograms, like every Ghostwire app. */
  selectAggregationTemporality(type: InstrumentType) {
    return type === InstrumentType.UP_DOWN_COUNTER || type === InstrumentType.OBSERVABLE_UP_DOWN_COUNTER
      ? AggregationTemporality.CUMULATIVE
      : AggregationTemporality.DELTA;
  }

  async shutdown() {}
  async forceFlush() {}
}

const NOT_SAMPLED: SamplingResult = { decision: SamplingDecision.NOT_RECORD };

/** Records nothing while self monitoring is off, nor for ignored paths; otherwise every trace. */
class SelfSampler implements Sampler {
  private readonly parentBased = new ParentBasedSampler({
    root: { shouldSample: () => ({ decision: SamplingDecision.RECORD_AND_SAMPLED }), toString: () => 'AlwaysOn' },
  });

  shouldSample(ctx: Context, traceId: string, name: string, kind: SpanKind, attributes: Attributes, links: Link[]) {
    if (!peekSelfMonitoring()?.enabled) return NOT_SAMPLED;
    if (isIgnoredPath(attributes['url.path'] ?? attributes['http.target'])) return NOT_SAMPLED;
    return this.parentBased.shouldSample(ctx, traceId, name, kind, attributes, links);
  }

  toString() {
    return 'GhostwireSelfSampler';
  }
}

/** The request metric from Next.js's request spans (they have the route pattern). */
class RequestMetricProcessor implements SpanProcessor {
  private histogram: Histogram | null = null;

  onStart(_span: Span) {}

  onEnd(span: ReadableSpan) {
    const a = span.attributes;
    if (a['next.span_type'] !== 'BaseServer.handleRequest') return;
    if (isIgnoredPath(a['http.target'] ?? a['url.path'])) return;

    this.histogram ??= metrics.getMeter('ghostwire-analytics').createHistogram('http.server.request.duration', {
      unit: 's',
      description: 'Duration of HTTP server requests (from Next.js request spans)',
      advice: { explicitBucketBoundaries: REQUEST_BUCKETS },
    });

    const [seconds, nanos] = span.duration;
    const route = a['http.route'] ?? a['next.route'];
    // Next reports router prefetches and client-side navigations without a route ("RSC GET").
    // They stay in the traces but out of the request metric, rather than one unnamed endpoint.
    if (!route && a['next.bubble'] === true) return;
    this.histogram.record(seconds + nanos / 1e9, {
      'http.request.method': String(a['http.request.method'] ?? a['http.method'] ?? 'GET'),
      'http.response.status_code': Number(a['http.response.status_code'] ?? a['http.status_code'] ?? 0),
      ...(route ? { 'http.route': String(route) } : {}),
    });
  }

  async forceFlush() {}
  async shutdown() {}
}

export interface SelfTelemetry {
  forceFlush(): Promise<void>;
  shutdown(): Promise<void>;
}

/** Starts self-monitoring telemetry for this process; once only, never throws. */
export function registerSelfTelemetry(): SelfTelemetry | null {
  if (process.env.OTEL_SDK_DISABLED === 'true') return null;

  const store = globalThis as unknown as Record<symbol, SelfTelemetry | undefined>;
  if (store[INSTANCE]) return store[INSTANCE]!;

  try {
    void getSelfMonitoring();
    const environment = process.env.DEPLOYMENT_ENVIRONMENT || process.env.NODE_ENV || 'production';
    const resource = defaultResource().merge(
      resourceFromAttributes({
        'service.name': SELF_SERVICE.name,
        'service.namespace': SELF_SERVICE.namespace,
        ...(process.env.APP_VERSION ? { 'service.version': process.env.APP_VERSION } : {}),
        'deployment.environment': environment,
        'deployment.environment.name': environment,
        'host.name': hostname(),
        'process.pid': process.pid,
      }),
    );

    const tracerProvider = new TracerProvider({
      resource,
      sampler: new SelfSampler(),
      spanProcessors: [
        new RequestMetricProcessor(),
        new BatchSpanProcessor({ exporter: new InProcessSpanExporter(), scheduledDelayMillis: 5000, maxQueueSize: 2048 }),
      ],
    });
    const meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new InProcessMetricExporter(),
          exportIntervalMillis: 30_000,
          exportTimeoutMillis: 15_000,
        }),
      ],
    });

    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    propagation.setGlobalPropagator(
      new CompositePropagator({ propagators: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()] }),
    );
    trace.setGlobalTracerProvider(tracerProvider);
    metrics.setGlobalMeterProvider(meterProvider);

    registerInstrumentations({
      tracerProvider,
      meterProvider,
      instrumentations: [
        new UndiciInstrumentation(),
        // Prisma traces its own queries (prisma:client:db_query, with the SQL); pg is loaded as an
        // ES module by the Prisma adapter, which require hooks can't see.
        new PrismaInstrumentation(),
      ],
    });

    const handle: SelfTelemetry = {
      forceFlush: () => Promise.all([tracerProvider.forceFlush(), meterProvider.forceFlush()]).then(() => {}, () => {}),
      shutdown: () => Promise.all([tracerProvider.shutdown(), meterProvider.shutdown()]).then(() => {}, () => {}),
    };
    store[INSTANCE] = handle;
    return handle;
  } catch (error) {
    log.warn('self_monitoring.start_failed', { error });
    return null;
  }
}
