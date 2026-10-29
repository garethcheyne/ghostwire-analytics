import { gzipSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashErrorKey } from '@/lib/error-key';

const findFirst = vi.fn();
const ingestMetrics = vi.fn();
const ingestTraces = vi.fn();
const fileSpanExceptions = vi.fn();
const allow = vi.fn();

vi.mock('@/lib/prisma', () => ({ prisma: { website: { findFirst } }, default: {} }));
vi.mock('@/lib/alerts', () => ({ afterResponse: (task: () => unknown) => task() }));
vi.mock('@/lib/rate-limit', () => ({ createLimiter: () => allow }));
vi.mock('./ingest', () => ({ ingestMetrics, ingestTraces, fileSpanExceptions }));

const { handleOtlpRequest, websiteForKey } = await import('./http');

const KEY = 'gwe_abcdefghijklmnopqrstuvwxyz012345';
const WEBSITE = '11111111-1111-4111-8111-111111111111';

function post(body: BodyInit, headers: Record<string, string> = {}) {
  return new Request('http://localhost/v1/metrics', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}`, ...headers },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findFirst.mockResolvedValue({ id: WEBSITE, errorKeyHash: hashErrorKey(KEY) });
  allow.mockResolvedValue(true);
  ingestMetrics.mockResolvedValue({ accepted: 1, rejected: 0 });
  ingestTraces.mockResolvedValue({ accepted: 1, rejected: 0, exceptions: [] });
});

describe('websiteForKey', () => {
  it('finds the website by the hash of the key', async () => {
    expect(await websiteForKey(KEY)).toBe(WEBSITE);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { errorKeyHash: hashErrorKey(KEY), deletedAt: null } }),
    );
  });

  it('refuses keys without the prefix, oversized keys and unknown keys without a lookup', async () => {
    expect(await websiteForKey('gwa_nope')).toBeNull();
    expect(await websiteForKey(`gwe_${'x'.repeat(300)}`)).toBeNull();
    expect(await websiteForKey(undefined)).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();

    findFirst.mockResolvedValue(null);
    expect(await websiteForKey(KEY)).toBeNull();
  });
});

describe('POST /v1/*', () => {
  it('stores a JSON export and answers with an empty ExportMetricsServiceResponse', async () => {
    const response = await handleOtlpRequest(post('{"resourceMetrics":[]}'), 'metrics');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({});
    expect(ingestMetrics).toHaveBeenCalledWith(WEBSITE, { resourceMetrics: [] });
  });

  it('accepts gzip bodies', async () => {
    const response = await handleOtlpRequest(
      post(gzipSync(Buffer.from('{"resourceSpans":[]}')), { 'content-encoding': 'gzip' }),
      'traces',
    );
    expect(response.status).toBe(200);
    expect(ingestTraces).toHaveBeenCalledWith(WEBSITE, { resourceSpans: [] });
  });

  it('reports refused points as a partial success', async () => {
    ingestMetrics.mockResolvedValue({ accepted: 5, rejected: 2, message: 'over the limits' });
    const response = await handleOtlpRequest(post('{}'), 'metrics');
    expect(await response.json()).toEqual({
      partialSuccess: { rejectedDataPoints: '2', errorMessage: 'over the limits' },
    });
  });

  it('files span exceptions after storing the spans', async () => {
    const exceptions = [{ spanId: 'a' }];
    ingestTraces.mockResolvedValue({ accepted: 1, rejected: 0, exceptions });
    await handleOtlpRequest(post('{}'), 'traces');
    expect(fileSpanExceptions).toHaveBeenCalledWith(WEBSITE, exceptions, expect.any(Function));
  });

  it('refuses unknown content types', async () => {
    const response = await handleOtlpRequest(post('{}', { 'content-type': 'text/plain' }), 'metrics');
    expect(response.status).toBe(415);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('refuses a missing or wrong key with 401 and a Status body', async () => {
    findFirst.mockResolvedValue(null);
    const response = await handleOtlpRequest(post('{}'), 'metrics');
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ code: 16, message: 'Missing or invalid ingest key.' });
    expect(ingestMetrics).not.toHaveBeenCalled();
  });

  it('refuses oversized bodies before reading them', async () => {
    const response = await handleOtlpRequest(
      post('{}', { 'content-length': String(11 * 1024 * 1024) }),
      'metrics',
    );
    expect(response.status).toBe(413);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('rate-limits per website with a retryable 429', async () => {
    allow.mockResolvedValue(false);
    const response = await handleOtlpRequest(post('{}'), 'metrics');
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('30');
    expect(allow).toHaveBeenCalledWith(WEBSITE);
  });

  it('answers malformed bodies with 400 (not retried)', async () => {
    const response = await handleOtlpRequest(post('{nope'), 'metrics');
    expect(response.status).toBe(400);
  });

  it('answers protobuf requests with protobuf errors', async () => {
    const response = await handleOtlpRequest(
      post(new Uint8Array([0xff, 0xff]), { 'content-type': 'application/x-protobuf' }),
      'metrics',
    );
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toBe('application/x-protobuf');
  });

  it('answers a storage failure with a retryable 503', async () => {
    ingestMetrics.mockRejectedValue(new Error('db down'));
    const response = await handleOtlpRequest(post('{}'), 'metrics');
    expect(response.status).toBe(503);
  });
});
