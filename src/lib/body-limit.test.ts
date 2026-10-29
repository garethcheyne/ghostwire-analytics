import { describe, expect, test } from 'vitest';
import { isBodyTooLarge, measureBody } from './body-limit';

const chunked = (chunks: number[]) => {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pulled >= chunks.length) return controller.close();
      controller.enqueue(new Uint8Array(chunks[pulled++]!));
    },
  });
  const request = new Request('https://example.org/api/send', {
    method: 'POST',
    body: stream,
    // @ts-expect-error Node's fetch needs this for a streamed body.
    duplex: 'half',
  });

  return { request, pulled: () => pulled };
};

describe('measureBody', () => {
  test('trusts a declared Content-Length', async () => {
    const request = new Request('https://example.org', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '999999' },
    });
    expect(await measureBody(request, 1000)).toBe(999999);
  });

  test('measures a body without one', async () => {
    const { request } = chunked([10, 20]);
    expect(await measureBody(request, 1000)).toBe(30);
  });

  test('stops reading once a chunked body passes the limit', async () => {
    const { request, pulled } = chunked(Array.from({ length: 100 }, () => 1000));
    expect(await isBodyTooLarge(request, 2500)).toBe(true);
    expect(pulled()).toBeLessThan(10);
  });

  test('a request without a body is empty', async () => {
    expect(await isBodyTooLarge(new Request('https://example.org'), 10)).toBe(false);
  });

  test('the original body can still be read after a check', async () => {
    const request = new Request('https://example.org', { method: 'POST', body: '{"a":1}' });
    request.headers.delete('content-length');
    expect(await isBodyTooLarge(request, 100)).toBe(false);
    expect(await request.json()).toEqual({ a: 1 });
  });
});
