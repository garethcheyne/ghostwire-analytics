import { gzipSync } from 'node:zlib';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import {
  JsonMetricsSerializer,
  JsonTraceSerializer,
  ProtobufMetricsSerializer,
  ProtobufTraceSerializer,
} from '@opentelemetry/otlp-transformer';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  AggregationTemporality,
  MeterProvider,
  MetricReader,
  type ResourceMetrics,
} from '@opentelemetry/sdk-metrics';
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from '@opentelemetry/sdk-trace';
import protobuf from 'protobufjs';
import descriptor from './otlp-proto.json';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hashKey,
  limitSeries,
  MAX_SERIES_PER_METRIC,
  OVERFLOW_ATTRIBUTES,
  resetCardinality,
  seriesAttributes,
} from './attributes';
import { applyDeltas, FRESH_START_MS, toDelta } from './cumulative';
import { decodeRequest, decompress, encodeResponse, encodingOf, errorBody, OtlpRequestError } from './decode';
import { durationFactor, exponentialToExplicit, flattenMetrics, KIND, type MetricPoint } from './metrics';
import { percentile, percentiles } from './percentile';
import { rollup } from './rollup';
import { flattenSpans, sanitizeStatement, SPAN_KIND } from './spans';
import { readService } from './service';
import { toHexId } from './values';

const WEBSITE = '11111111-1111-4111-8111-111111111111';

const resource = resourceFromAttributes({
  'service.name': 'api',
  'service.namespace': 'ghostwire-test',
  'service.version': '2026.10.29.1200',
  'deployment.environment': 'test',
  'telemetry.sdk.language': 'nodejs',
});

class TestReader extends MetricReader {
  constructor(temporality: AggregationTemporality) {
    super({ aggregationTemporalitySelector: () => temporality });
  }
  protected async onShutdown() {}
  protected async onForceFlush() {}
}

/** Real SDK output: what a Node service's OTLP exporter would send. */
async function sdkMetrics(temporality = AggregationTemporality.DELTA): Promise<ResourceMetrics> {
  const reader = new TestReader(temporality);
  const provider = new MeterProvider({ resource, readers: [reader] });
  const meter = provider.getMeter('test');

  const duration = meter.createHistogram('http.server.request.duration', {
    unit: 's',
    advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1] },
  });
  for (const [seconds, status] of [
    [0.003, 200],
    [0.02, 200],
    [0.04, 200],
    [0.3, 500],
  ] as const) {
    duration.record(seconds, {
      'http.route': '/api/items/:id',
      'http.request.method': 'GET',
      'http.response.status_code': status,
      'url.full': `https://example.com/api/items/${Math.random()}?token=secret`,
      'client.address': '203.0.113.9',
    });
  }

  meter.createCounter('ghostwire.job.runs').add(2, { job: 'collect', outcome: 'ok' });
  meter.createCounter('ghostwire.heartbeat').add(1);
  meter.createGauge('process.memory.usage', { unit: 'By' }).record(1234, { type: 'rss' });

  const { resourceMetrics } = await reader.collect();
  await provider.shutdown();
  return resourceMetrics;
}

async function sdkSpans() {
  const exporter = new InMemorySpanExporter();
  const provider = new TracerProvider({ resource, spanProcessors: [new SimpleSpanProcessor({ exporter })] });
  const tracer = provider.getTracer('test');

  tracer.startActiveSpan(
    'GET /api/items/:id',
    { kind: SpanKind.SERVER, attributes: { 'http.route': '/api/items/:id', 'http.request.method': 'GET', 'http.response.status_code': 500, 'url.full': 'https://example.com/api/items/7?token=abc', 'http.request.header.authorization': 'Bearer x' } },
    span => {
      const child = tracer.startSpan('SELECT items', {
        kind: SpanKind.CLIENT,
        attributes: {
          'db.system': 'postgresql',
          'server.address': 'db',
          'db.statement': "select * from items where id = 42 and name = 'bob'",
        },
      }, trace.setSpan(context.active(), span));
      child.end();
      span.recordException(new TypeError('Cannot read properties of undefined'));
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'boom' });
      span.end();
    },
  );

  const spans = exporter.getFinishedSpans();
  await provider.shutdown();
  return spans;
}

beforeEach(() => resetCardinality());
afterEach(() => resetCardinality());

describe('decoding', () => {
  it('reads content types', () => {
    expect(encodingOf('application/x-protobuf')).toBe('protobuf');
    expect(encodingOf('application/json; charset=utf-8')).toBe('json');
    expect(encodingOf('text/plain')).toBeNull();
    expect(encodingOf(null)).toBeNull();
  });

  it('decodes SDK protobuf and JSON metrics to the same points', async () => {
    const data = await sdkMetrics();
    const proto = decodeRequest('metrics', 'protobuf', ProtobufMetricsSerializer.serializeRequest(data)!);
    const json = decodeRequest('metrics', 'json', JsonMetricsSerializer.serializeRequest(data)!);

    const a = flattenMetrics(WEBSITE, proto);
    resetCardinality();
    const b = flattenMetrics(WEBSITE, json);

    // Four histogram points (the SDK keeps every attribute set apart), a counter, a heartbeat, a gauge.
    expect(a.points.length).toBe(7);
    expect(a.rejected).toBe(0);
    const strip = (p: MetricPoint) => ({ ...p, stream: '' });
    expect(a.points.map(strip)).toEqual(b.points.map(strip));
  });

  it('decodes gzip bodies and refuses decompression bombs', () => {
    const json = Buffer.from(JSON.stringify({ resourceMetrics: [] }));
    expect(decodeRequest('metrics', 'json', decompress(gzipSync(json), 'gzip'))).toEqual({ resourceMetrics: [] });

    const bomb = gzipSync(Buffer.alloc(50 * 1024 * 1024));
    expect(() => decompress(bomb, 'gzip')).toThrow(OtlpRequestError);
    expect(() => decompress(Buffer.from('nope'), 'gzip')).toThrow(OtlpRequestError);
    expect(() => decompress(json, 'br')).toThrow(/Unsupported/);
  });

  it('refuses malformed bodies', () => {
    expect(() => decodeRequest('traces', 'json', Buffer.from('[1,2]'))).toThrow(OtlpRequestError);
    expect(() => decodeRequest('traces', 'json', Buffer.from('{oops'))).toThrow(OtlpRequestError);
    expect(() => decodeRequest('traces', 'protobuf', Buffer.from([0xff, 0xff, 0xff]))).toThrow(OtlpRequestError);
  });

  it('encodes OTLP responses, with partial success when something was refused', () => {
    expect(encodeResponse('metrics', 'json', 0).body).toBe('{}');
    expect(JSON.parse(encodeResponse('traces', 'json', 3, 'too big').body as string)).toEqual({
      partialSuccess: { rejectedSpans: '3', errorMessage: 'too big' },
    });
    const bytes = encodeResponse('metrics', 'protobuf', 2, 'x').body as Uint8Array;
    const root = protobuf.Root.fromJSON(descriptor as protobuf.INamespace);
    const type = root.lookupType('opentelemetry.proto.collector.metrics.v1.ExportMetricsServiceResponse');
    expect(type.toObject(type.decode(bytes), { longs: String })).toEqual({
      partialSuccess: { rejectedDataPoints: '2', errorMessage: 'x' },
    });
  });

  it('writes google.rpc.Status error bodies', () => {
    expect(JSON.parse(errorBody('json', 16, 'no key').body as string)).toEqual({ code: 16, message: 'no key' });
    const reader = protobuf.Reader.create(errorBody('protobuf', 16, 'no key').body as Uint8Array);
    expect(reader.uint32()).toBe(8);
    expect(reader.int32()).toBe(16);
    expect(reader.uint32()).toBe(18);
    expect(reader.string()).toBe('no key');
  });

  it('reads trace IDs as hex or base64', () => {
    const hex = '5b8efff798038103d269b633813fc60c';
    expect(toHexId(hex, 16)).toBe(hex);
    expect(toHexId(Buffer.from(hex, 'hex').toString('base64'), 16)).toBe(hex);
    expect(toHexId('00000000000000000000000000000000', 16)).toBeNull();
    expect(toHexId('short', 8)).toBeNull();
  });
});

describe('metric points', () => {
  it('keeps only the family attributes, converts durations to ms, and finds heartbeats', async () => {
    const decoded = decodeRequest('metrics', 'protobuf', ProtobufMetricsSerializer.serializeRequest(await sdkMetrics())!);
    const { points, heartbeats, services } = flattenMetrics(WEBSITE, decoded);
    const http = points.filter(p => p.metric === 'http.server.request.duration');

    expect(http).toHaveLength(4);
    // URLs and client addresses are dropped, so they fold into two series: the 200s and the 500s.
    expect(new Set(http.map(p => p.attrsHash)).size).toBe(2);
    for (const p of http) {
      expect(Object.keys(p.attrs).sort()).toEqual(['http.request.method', 'http.response.status_code', 'http.route']);
      expect(p.unit).toBe('ms');
      expect(p.bounds[0]).toBeCloseTo(5);
      expect(p.kind).toBe(KIND.histogram);
      expect(p.cumulative).toBe(false);
    }
    const [ok] = rollup(http.filter(p => p.attrs['http.response.status_code'] === 200));
    expect(ok.count).toBe(3);
    expect(ok.sum).toBeCloseTo(63);
    expect(ok.min).toBeCloseTo(3);
    expect(ok.buckets).toEqual([1, 0, 1, 1, 0, 0, 0, 0, 0]);

    expect(heartbeats.has('ghostwire-test\u0000api')).toBe(true);
    expect([...services.values()][0]).toMatchObject({
      namespace: 'ghostwire-test',
      name: 'api',
      version: '2026.10.29.1200',
      environment: 'test',
      language: 'nodejs',
    });
    expect(points.find(p => p.metric === 'process.memory.usage')).toMatchObject({ kind: KIND.gauge, value: 1234 });
  });

  it('marks cumulative SDK data for delta conversion', async () => {
    const decoded = decodeRequest(
      'metrics',
      'json',
      JsonMetricsSerializer.serializeRequest(await sdkMetrics(AggregationTemporality.CUMULATIVE))!,
    );
    const { points } = flattenMetrics(WEBSITE, decoded);
    expect(points.find(p => p.metric === 'ghostwire.job.runs')).toMatchObject({ cumulative: true, value: 2 });
  });

  it('reads older semantic-convention names as the current ones', () => {
    const request = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'api' } }] },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'http.server.duration',
                  unit: 'ms',
                  histogram: {
                    aggregationTemporality: 1,
                    dataPoints: [
                      {
                        timeUnixNano: '1761700000000000000',
                        count: '1',
                        sum: 12,
                        bucketCounts: ['0', '1'],
                        explicitBounds: [10],
                        attributes: [
                          { key: 'http.method', value: { stringValue: 'POST' } },
                          { key: 'http.status_code', value: { intValue: '201' } },
                          { key: 'http.target', value: { stringValue: '/items?x=1' } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    const [point] = flattenMetrics(WEBSITE, request).points;
    expect(point.metric).toBe('http.server.request.duration');
    expect(point.attrs).toEqual({ 'http.request.method': 'POST', 'http.response.status_code': 201 });
    expect(point.sum).toBe(12);
  });

  it('treats up/down sums (memory in use) as readings and monotonic sums as counters', () => {
    const sum = (name: string, isMonotonic: boolean, value: number) => ({
      name,
      sum: {
        aggregationTemporality: 2,
        isMonotonic,
        dataPoints: [{ timeUnixNano: '1761700000000000000', startTimeUnixNano: '1', asInt: String(value) }],
      },
    });
    const request = {
      resourceMetrics: [
        {
          resource: { attributes: [{ key: 'host.name', value: { stringValue: 'box' } }] },
          scopeMetrics: [{ metrics: [sum('system.memory.usage', false, 500), sum('system.cpu.time', true, 9)] }],
        },
      ],
    };
    const { points } = flattenMetrics(WEBSITE, request);
    expect(points[0]).toMatchObject({ kind: KIND.gauge, cumulative: false, value: 500, attrs: { 'host.name': 'box' } });
    expect(points[1]).toMatchObject({ kind: KIND.counter, cumulative: true, value: 9 });
    expect(points[0].service.name).toBe('unknown_service');
  });

  it('caps the points read from one request', () => {
    const dataPoints = Array.from({ length: 30 }, (_, i) => ({ timeUnixNano: '1761700000000000000', asDouble: i }));
    const request = { resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: 'g', gauge: { dataPoints } }] }] }] };
    const result = flattenMetrics(WEBSITE, request, { maxPoints: 10 });
    expect(result.points).toHaveLength(10);
    expect(result.rejected).toBe(20);
  });

  it('converts exponential histograms to explicit buckets', () => {
    const { bounds, buckets } = exponentialToExplicit({
      scale: 0,
      zeroCount: '1',
      positive: { offset: 1, bucketCounts: ['2', '3'] },
    });
    expect(bounds).toEqual([2, 4, 8]);
    expect(buckets).toEqual([1, 2, 3, 0]);
  });

  it('knows which units are durations', () => {
    expect(durationFactor('http.server.request.duration', 's')).toBe(1000);
    expect(durationFactor('ghostwire.job.duration', 'ms')).toBe(1);
    expect(durationFactor('process.memory.usage', 's')).toBeNull();
  });
});

describe('cardinality', () => {
  it('drops high-cardinality and personal attributes from metric series', () => {
    expect(
      seriesAttributes(
        'my.custom.metric',
        { 'url.full': 'x', 'client.address': '1.2.3.4', 'user.id': 'u', 'request.id': 'r', region: 'eu', tier: 'gold' },
        {},
      ),
    ).toEqual({ region: 'eu', tier: 'gold' });

    expect(seriesAttributes('container.cpu.usage.total', { 'container.id': 'abc' }, { 'container.name': 'api' })).toEqual({
      'container.name': 'api',
    });
  });

  it('folds new attribute sets into the overflow series once a metric has too many', () => {
    for (let i = 0; i < MAX_SERIES_PER_METRIC; i++) {
      expect(limitSeries('scope', `h${i}`, { route: `/r${i}` }).overflow).toBe(false);
    }
    const over = limitSeries('scope', 'new', { route: '/new' });
    expect(over.overflow).toBe(true);
    expect(over.attrs).toEqual(OVERFLOW_ATTRIBUTES);
    expect(over.attrsHash).toBe(hashKey(OVERFLOW_ATTRIBUTES));
    // Already-known series keep working.
    expect(limitSeries('scope', 'h3', { route: '/r3' }).overflow).toBe(false);
  });
});

function counter(value: number, timeMs: number, startMs = 1000): MetricPoint {
  return {
    service: readService({ 'service.name': 'api' }),
    stream: 's1',
    metric: 'c',
    unit: null,
    kind: KIND.counter,
    cumulative: true,
    attrs: {},
    attrsHash: 'h',
    timeMs,
    startMs,
    value,
    count: 1,
    sum: 0,
    min: null,
    max: null,
    bounds: [],
    buckets: [],
  };
}

describe('cumulative to delta', () => {
  const now = 10_000_000_000;

  it('uses the first point of an old stream as a baseline', () => {
    expect(toDelta(counter(100, now, now - FRESH_START_MS * 10), undefined, now).delta).toBeNull();
  });

  it('counts the whole total of a stream that just started', () => {
    expect(toDelta(counter(7, now, now - 1000), undefined, now).delta?.value).toBe(7);
  });

  it('turns running totals into differences, and handles resets and restarts', () => {
    const states = new Map([['s1', { startMs: 1000, value: 100, count: 1, buckets: [] }]]);
    const { points, changed } = applyDeltas(
      [counter(130, now + 60_000), counter(110, now), counter(5, now + 120_000), counter(9, now + 180_000, 5000)],
      states,
      now,
    );
    // Sorted by time: 100→110 (+10), →130 (+20), →5 (reset: 5), new start time (restart: 9).
    expect(points.map(p => p.value)).toEqual([10, 20, 5, 9]);
    expect(points.every(p => !p.cumulative)).toBe(true);
    expect(changed.get('s1')).toEqual({ startMs: 5000, value: 9, count: 1, buckets: [] });
  });

  it('differences histogram buckets, count and sum', () => {
    const base = { ...counter(0, now), kind: KIND.histogram, bounds: [10], min: 1, max: 50 } as MetricPoint;
    const { delta } = toDelta({ ...base, count: 5, sum: 100, buckets: [3, 2] }, { startMs: 1000, value: 40, count: 2, buckets: [1, 1] }, now);
    expect(delta).toMatchObject({ count: 3, sum: 60, buckets: [2, 1], min: null, max: null });
  });

  it('passes delta and gauge points through untouched', () => {
    const delta = { ...counter(4, now), cumulative: false };
    expect(applyDeltas([delta], new Map(), now).points).toEqual([delta]);
  });
});

describe('rollups', () => {
  it('sums counters, tracks gauge readings and merges histogram buckets per minute', () => {
    const t = Date.UTC(2026, 9, 29, 12, 0, 10);
    const gauge = { ...counter(0, t), kind: KIND.gauge, cumulative: false } as MetricPoint;
    const hist = { ...counter(0, t), kind: KIND.histogram, cumulative: false, metric: 'h', bounds: [10, 100] } as MetricPoint;
    const rows = rollup([
      { ...counter(2, t), cumulative: false },
      { ...counter(3, t + 20_000), cumulative: false },
      { ...counter(4, t + 60_000), cumulative: false },
      { ...gauge, metric: 'g', value: 5 },
      { ...gauge, metric: 'g', value: 1, timeMs: t + 30_000 },
      { ...hist, count: 2, sum: 30, min: 5, max: 25, buckets: [1, 1, 0] },
      { ...hist, count: 1, sum: 500, min: 500, max: 500, buckets: [0, 0, 1] },
    ]);

    const c = rows.filter(r => r.metric === 'c');
    expect(c.map(r => [r.bucket - Date.UTC(2026, 9, 29, 12), r.sum, r.count])).toEqual([
      [0, 5, 2],
      [60_000, 4, 1],
    ]);
    expect(rows.find(r => r.metric === 'g')).toMatchObject({ count: 2, sum: 6, min: 1, max: 5, last: 1 });
    expect(rows.find(r => r.metric === 'h')).toMatchObject({ count: 3, sum: 530, min: 5, max: 500, buckets: [1, 1, 1] });
  });
});

describe('percentiles', () => {
  it('interpolates inside the bucket holding the quantile', () => {
    // 100 observations: 50 in (0,10], 40 in (10,100], 10 in (100,1000].
    const part = { bounds: [10, 100, 1000], buckets: [50, 40, 10, 0] };
    expect(percentile([part], 0.5)).toBeCloseTo(10);
    expect(percentile([part], 0.7)).toBeCloseTo(55);
    expect(percentile([part], 0.95)).toBeCloseTo(550);
    expect(percentiles([part]).p99).toBeCloseTo(910);
  });

  it('bounds the answer by the observed min and max and closes the overflow bucket', () => {
    const part = { bounds: [10], buckets: [0, 4] };
    expect(percentile([part], 1, 12, 40)).toBe(40);
    expect(percentile([part], 0.5, 12, 40)).toBeCloseTo(25);
  });

  it('merges histograms with different bounds', () => {
    const value = percentile(
      [
        { bounds: [10, 20], buckets: [10, 0, 0] },
        { bounds: [5, 50], buckets: [0, 10, 0] },
      ],
      0.75,
    );
    expect(value).toBeGreaterThan(5);
    expect(value).toBeLessThanOrEqual(50);
  });

  it('is null without observations', () => {
    expect(percentile([{ bounds: [1], buckets: [0, 0] }], 0.5)).toBeNull();
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe('spans', () => {
  it('decodes SDK spans from protobuf and JSON the same way', async () => {
    const spans = await sdkSpans();
    const proto = flattenSpans(decodeRequest('traces', 'protobuf', ProtobufTraceSerializer.serializeRequest(spans)!));
    const json = flattenSpans(decodeRequest('traces', 'json', JsonTraceSerializer.serializeRequest(spans)!));

    expect(proto.spans).toHaveLength(2);
    expect(proto.spans).toEqual(json.spans);

    const server = proto.spans.find(s => s.kind === SPAN_KIND.server)!;
    const client = proto.spans.find(s => s.kind === SPAN_KIND.client)!;

    expect(server).toMatchObject({
      isEntry: true,
      parentSpanId: null,
      status: 2,
      statusMessage: 'boom',
      route: '/api/items/:id',
      httpMethod: 'GET',
      httpStatus: 500,
    });
    expect(server.attributes['url.full']).toBe('https://example.com/api/items/7');
    expect(server.attributes['http.request.header.authorization']).toBeUndefined();
    expect(server.exceptions[0]).toMatchObject({ type: 'TypeError', message: 'Cannot read properties of undefined' });
    expect(server.exceptions[0].stack).toContain('TypeError');

    expect(client).toMatchObject({
      isEntry: false,
      parentSpanId: server.spanId,
      traceId: server.traceId,
      dbSystem: 'postgresql',
      peer: 'db',
      dbStatement: 'select * from items where id = ? and name = ?',
    });
    expect(client.attributes['db.statement']).toBeUndefined();
  });

  it('refuses spans without IDs or a start time, and caps the count', () => {
    const span = (spanId: string) => ({
      traceId: '5b8efff798038103d269b633813fc60c',
      spanId,
      name: 'x',
      startTimeUnixNano: '1761700000000000000',
      endTimeUnixNano: '1761700000500000000',
    });
    const request = {
      resourceSpans: [
        { scopeSpans: [{ spans: [span('eee4b2a3f0a5b1c2'), span('bad'), { ...span('fff4b2a3f0a5b1c2'), startTimeUnixNano: '0' }, span('aaa4b2a3f0a5b1c2')] }] },
      ],
    };
    const result = flattenSpans(request, { maxSpans: 1 });
    expect(result.spans).toHaveLength(1);
    expect(result.spans[0].durationMs).toBe(500);
    expect(result.rejected).toBe(3);
  });

  it('lists served requests and root job runs as entries, not root outgoing calls', () => {
    const span = (spanId: string, kind: number, parentSpanId?: string) => ({
      traceId: '5b8efff798038103d269b633813fc60c',
      spanId,
      parentSpanId,
      kind,
      name: `k${kind}`,
      startTimeUnixNano: '1761700000000000000',
    });
    const { spans } = flattenSpans({
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                span('a000000000000001', 3),
                span('a000000000000002', 2, 'a000000000000001'),
                span('a000000000000003', 1, 'a000000000000002'),
                span('a000000000000004', 1),
              ],
            },
          ],
        },
      ],
    });
    expect(spans.map(s => s.isEntry)).toEqual([false, true, false, true]);
  });

  it('replaces statement literals with ?', () => {
    expect(sanitizeStatement("SELECT * FROM t WHERE a = 'x''y' AND b = 12.5 AND c = $1 AND t2.col1 = -3")).toBe(
      'SELECT * FROM t WHERE a = ? AND b = ? AND c = $1 AND t2.col1 = ?',
    );
    expect(sanitizeStatement('{"query":{"match":{"user":"kim","age":42}}}')).toBe('{"query":{"match":{"user":?,"age":?}}}');
    expect(sanitizeStatement(undefined)).toBeNull();
    expect(sanitizeStatement('x'.repeat(5000))!.length).toBe(1000);
  });
});
