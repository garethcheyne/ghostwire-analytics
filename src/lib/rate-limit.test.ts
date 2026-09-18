import { afterEach, describe, expect, it, vi } from 'vitest';

const queryRaw = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: {
    client: { $queryRaw: queryRaw, rateLimit: { deleteMany: vi.fn(async () => ({})) } },
  },
}));

const { createIpRateLimiter, createLimiter, createRateLimiter } = await import('./rate-limit');

const request = (ip?: string) =>
  new Request('https://gw.example.com/api/send', {
    method: 'POST',
    headers: ip ? { 'x-forwarded-for': ip } : {},
  });

afterEach(() => {
  delete process.env.RATE_LIMIT_STORE;
  queryRaw.mockReset();
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
  it('limits each client IP separately', async () => {
    const allow = createIpRateLimiter({ name: 't', limit: 1, windowMs: 60_000 });

    expect(await allow(request('203.0.113.1'))).toBe(true);
    expect(await allow(request('203.0.113.1'))).toBe(false);
    expect(await allow(request('203.0.113.2'))).toBe(true);
  });

  it('never blocks requests without a known IP', async () => {
    const allow = createIpRateLimiter({ name: 't', limit: 1, windowMs: 60_000 });

    expect(await allow(request())).toBe(true);
    expect(await allow(request())).toBe(true);
  });
});

describe('shared store (RATE_LIMIT_STORE=postgres)', () => {
  it('counts in Postgres per name, key and window', async () => {
    process.env.RATE_LIMIT_STORE = 'postgres';
    queryRaw.mockResolvedValueOnce([{ count: 2 }]).mockResolvedValueOnce([{ count: 3 }]);
    const allow = createLimiter({ name: 'send', limit: 2, windowMs: 60_000 });

    expect(await allow('203.0.113.1', 125_000)).toBe(true);
    expect(await allow('203.0.113.1', 125_000)).toBe(false);

    const [strings, key, windowStart] = queryRaw.mock.calls[0];
    expect(strings.join('?')).toContain('on conflict (key, window_start)');
    expect(key).toBe('send:203.0.113.1');
    expect(windowStart).toEqual(new Date(120_000));
  });

  it('lets requests through when the store fails', async () => {
    process.env.RATE_LIMIT_STORE = 'postgres';
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error('db down'));

    expect(await createLimiter({ name: 'send', limit: 1, windowMs: 1000 })('k')).toBe(true);
    error.mockRestore();
  });
});
