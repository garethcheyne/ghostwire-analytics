import { describe, expect, it } from 'vitest';
import { createIpRateLimiter, createRateLimiter } from './rate-limit';

const request = (ip?: string) =>
  new Request('https://gw.example.com/api/send', {
    method: 'POST',
    headers: ip ? { 'x-forwarded-for': ip } : {},
  });

describe('createRateLimiter', () => {
  it('allows `limit` calls per key per window', () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 1000 });

    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 10)).toBe(true);
    expect(allow('a', 20)).toBe(false);
    expect(allow('b', 20)).toBe(true);
    expect(allow('a', 1000)).toBe(true);
  });
});

describe('createIpRateLimiter', () => {
  it('limits each client IP separately', () => {
    const allow = createIpRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(allow(request('203.0.113.1'))).toBe(true);
    expect(allow(request('203.0.113.1'))).toBe(false);
    expect(allow(request('203.0.113.2'))).toBe(true);
  });

  it('never blocks requests without a known IP', () => {
    const allow = createIpRateLimiter({ limit: 1, windowMs: 60_000 });

    expect(allow(request())).toBe(true);
    expect(allow(request())).toBe(true);
  });
});
