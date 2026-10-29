/*
 * Requests captured from real senders during the end-to-end check (fixtures/):
 *   python-sdk-metrics.pb, python-sdk-traces.pb   a FastAPI service using the suite's
 *       ghostwire_telemetry.py (OpenTelemetry Python SDK 1.45, OTLP/HTTP protobuf exporter)
 *   collector-docker-stats.pb.gz, .json           otel/opentelemetry-collector-contrib 0.164.0,
 *       docker_stats through cumulative_to_delta, exported with otlp_http (gzip) and the file
 *       exporter (OTLP/JSON)
 *   collector-self-metrics.pb                     the same Collector's own telemetry
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetCardinality } from './attributes';
import { decodeRequest, decompress } from './decode';
import { flattenMetrics, KIND } from './metrics';
import { rollup } from './rollup';
import { flattenSpans, SPAN_KIND } from './spans';

const WEBSITE = '11111111-1111-4111-8111-111111111111';
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)));

beforeEach(() => resetCardinality());

describe('Python SDK (ghostwire_telemetry.py)', () => {
  const metrics = () => flattenMetrics(WEBSITE, decodeRequest('metrics', 'protobuf', fixture('python-sdk-metrics.pb')));

  it('reads the service from the resource', () => {
    const [service] = metrics().services.values();
    expect(service).toMatchObject({
      namespace: 'gw-mon-demo',
      name: 'api',
      version: '2026.10.30.0100',
      environment: 'e2e',
      language: 'python',
    });
  });

  it('reads request durations per route, in ms, as deltas', () => {
    const { points, rejected } = metrics();
    expect(rejected).toBe(0);
    const requests = points.filter(p => p.metric === 'http.server.request.duration');
    expect(requests.length).toBeGreaterThan(0);
    for (const p of requests) {
      expect(p).toMatchObject({ kind: KIND.histogram, cumulative: false, unit: 'ms' });
      expect(Object.keys(p.attrs).every(k => ['http.route', 'http.request.method', 'http.response.status_code', 'error.type'].includes(k))).toBe(true);
      expect(p.buckets.length).toBe(p.bounds.length + 1);
      expect(p.buckets.reduce((a, b) => a + b, 0)).toBe(p.count);
    }
    expect(requests.map(p => p.attrs['http.route'])).toContain('/items/{item_id}');
  });

  it('reads job runs by outcome and the heartbeat', () => {
    const { points, heartbeats } = metrics();
    const runs = points.filter(p => p.metric === 'ghostwire.job.runs');
    expect(runs.map(p => p.attrs.job)).toContain('sync-items');
    expect(runs.every(p => ['ok', 'error'].includes(String(p.attrs.outcome)))).toBe(true);
    expect(heartbeats.size).toBe(1);
  });

  it('reads server spans with routes, database spans with sanitized statements, and exceptions', () => {
    const { spans, rejected } = flattenSpans(decodeRequest('traces', 'protobuf', fixture('python-sdk-traces.pb')));
    expect(rejected).toBe(0);

    const server = spans.filter(s => s.kind === SPAN_KIND.server);
    expect(server.every(s => s.isEntry && s.route?.startsWith('/'))).toBe(true);

    const query = spans.find(s => s.dbSystem === 'postgresql' && s.dbStatement);
    expect(query).toMatchObject({ kind: SPAN_KIND.client, peer: 'gw-mon-db', isEntry: false });
    expect(query!.dbStatement).toBe('select id, name from items where id = %(id)s');

    const failed = spans.find(s => s.exceptions.length);
    expect(failed).toMatchObject({ route: '/fail', status: 2, httpStatus: 500 });
    expect(failed!.exceptions[0]).toMatchObject({ type: 'RuntimeError' });
    expect(failed!.exceptions[0].stack).toContain('Traceback');

    expect(spans.find(s => s.name === 'job sync-items')).toMatchObject({ isEntry: true, route: 'sync-items' });
  });
});

describe('OpenTelemetry Collector (docker_stats)', () => {
  const fromProtobuf = () =>
    flattenMetrics(
      WEBSITE,
      decodeRequest('metrics', 'protobuf', decompress(fixture('collector-docker-stats.pb.gz'), 'gzip')),
    );

  it('names each container as a service and keeps the container name on its points', () => {
    const { points, services } = fromProtobuf();
    const names = [...services.values()].map(s => s.name);
    expect(names.every(n => n.startsWith('gw-mon-'))).toBe(true);
    expect([...services.values()].every(s => s.namespace === 'gw-mon-demo')).toBe(true);

    const cpu = points.filter(p => p.metric === 'container.cpu.usage.total');
    expect(cpu.length).toBe(names.length);
    for (const p of cpu) {
      // cumulative_to_delta turned the running totals into deltas.
      expect(p).toMatchObject({ kind: KIND.counter, cumulative: false, unit: 'ns' });
      expect(p.attrs['container.name']).toBe(p.service.name);
    }
  });

  it('reads memory in use as a reading, not a total', () => {
    const memory = fromProtobuf().points.filter(p => p.metric === 'container.memory.usage.total');
    expect(memory.length).toBeGreaterThan(0);
    expect(memory.every(p => p.kind === KIND.gauge && p.value > 0)).toBe(true);
  });

  it('reads the file exporter’s OTLP/JSON the same way', () => {
    const { points, rejected } = flattenMetrics(
      WEBSITE,
      decodeRequest('metrics', 'json', fixture('collector-docker-stats.json')),
    );
    expect(rejected).toBe(0);
    const rows = rollup(points);
    expect(rows.some(r => r.metric === 'container.cpu.usage.total' && r.kind === KIND.counter)).toBe(true);
    expect(rows.some(r => r.metric === 'container.memory.percent' && r.kind === KIND.gauge)).toBe(true);
  });

  it('reads the Collector’s own telemetry', () => {
    const { points, services } = flattenMetrics(
      WEBSITE,
      decodeRequest('metrics', 'protobuf', fixture('collector-self-metrics.pb')),
    );
    expect([...services.values()][0]).toMatchObject({ name: 'otel-collector', version: '0.164.0' });
    expect(points.some(p => p.metric.startsWith('otelcol'))).toBe(true);
  });
});
