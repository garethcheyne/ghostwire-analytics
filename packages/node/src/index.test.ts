import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { captureException, errorHandler, init, normalizeRequest, reset } from './index';
import { onRequestError } from './next';

vi.mock('node:child_process', () => ({ spawnSync: vi.fn() }));

const OPTIONS = {
  host: 'https://analytics.example.com/',
  websiteId: '7d3ecc49-7e12-4672-b092-685c96d2a6d4',
  key: 'gwe_secret',
  environment: 'production',
  release: '2.4.1',
};

const fetchMock = vi.fn();

beforeEach(() => {
  reset();
  fetchMock.mockReset();
  // A new Response each call: a body can only be read once.
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ ok: true, groupId: 'group-1' }), { status: 202 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  reset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const sentBody = () => JSON.parse(fetchMock.mock.calls[0][1].body);

describe('captureException', () => {
  it('sends the error with request, user and release details', async () => {
    init({ ...OPTIONS, captureUncaught: false });
    const error = new TypeError('order is undefined');

    const groupId = await captureException(error, {
      user: { id: 'jane', email: 'jane@acme.io' },
      request: {
        method: 'POST',
        originalUrl: '/orders/checkout?token=secret',
        headers: { 'user-agent': 'Mozilla/5.0' },
      },
      tags: { feature: 'checkout' },
    });

    expect(groupId).toBe('group-1');
    const [url, init_] = fetchMock.mock.calls[0];
    expect(url).toBe('https://analytics.example.com/api/errors');
    expect(init_.headers.authorization).toBe('Bearer gwe_secret');
    expect(sentBody()).toMatchObject({
      website: OPTIONS.websiteId,
      platform: 'node',
      error: { type: 'TypeError', message: 'order is undefined' },
      handled: true,
      user: { id: 'jane', email: 'jane@acme.io' },
      // The query string never leaves the server.
      request: { method: 'POST', url: '/orders/checkout', userAgent: 'Mozilla/5.0' },
      environment: 'production',
      release: '2.4.1',
      tags: { feature: 'checkout' },
    });
    expect(sentBody().error.stack).toContain('TypeError: order is undefined');
  });

  it('can be configured from environment variables alone', async () => {
    vi.stubEnv('GHOSTWIRE_HOST', 'https://a.example.com');
    vi.stubEnv('GHOSTWIRE_WEBSITE_ID', OPTIONS.websiteId);
    vi.stubEnv('GHOSTWIRE_ERROR_KEY', 'gwe_env');

    await captureException(new Error('x'));

    expect(fetchMock.mock.calls[0][0]).toBe('https://a.example.com/api/errors');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer gwe_env');
  });

  it('does nothing when not configured', async () => {
    await expect(captureException(new Error('x'))).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never rejects: network failures, bad responses and odd values are swallowed', async () => {
    init({ ...OPTIONS, captureUncaught: false });

    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(captureException(new Error('x'))).resolves.toBeUndefined();

    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }));
    await expect(captureException(new Error('x'))).resolves.toBeUndefined();

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(captureException(circular)).resolves.toBe('group-1');
  });

  it('lets beforeSend change or drop a report, and survives it throwing', async () => {
    init({
      ...OPTIONS,
      captureUncaught: false,
      beforeSend: report =>
        report.error.message === 'drop' ? null : { ...report, tags: { scrubbed: 'yes' } },
    });

    await captureException(new Error('drop'));
    expect(fetchMock).not.toHaveBeenCalled();

    await captureException(new Error('keep'));
    expect(sentBody().tags).toEqual({ scrubbed: 'yes' });

    reset();
    init({
      ...OPTIONS,
      captureUncaught: false,
      beforeSend: () => {
        throw new Error('hook bug');
      },
    });
    fetchMock.mockClear();
    await expect(captureException(new Error('y'))).resolves.toBe('group-1');
  });
});

describe('crashes', () => {
  it('watches with uncaughtExceptionMonitor only, so crashes still exit', () => {
    const before = {
      monitor: process.listenerCount('uncaughtExceptionMonitor'),
      exception: process.listenerCount('uncaughtException'),
      rejection: process.listenerCount('unhandledRejection'),
    };

    init(OPTIONS);

    expect(process.listenerCount('uncaughtExceptionMonitor')).toBe(before.monitor + 1);
    expect(process.listenerCount('uncaughtException')).toBe(before.exception);
    expect(process.listenerCount('unhandledRejection')).toBe(before.rejection);
  });

  it('sends crash reports synchronously, with the key in the environment', () => {
    init(OPTIONS);

    process.emit('uncaughtExceptionMonitor', new Error('boom'), 'uncaughtException');

    expect(spawnSync).toHaveBeenCalledTimes(1);
    const [command, args, options] = vi.mocked(spawnSync).mock.calls[0] as any[];
    expect(command).toBe(process.execPath);
    expect(args.at(-1)).toBe('https://analytics.example.com/api/errors');
    expect(args.join(' ')).not.toContain('gwe_secret');
    expect(options.env.GHOSTWIRE_SEND_KEY).toBe('gwe_secret');
    expect(JSON.parse(options.input)).toMatchObject({
      error: { message: 'boom' },
      handled: false,
      extra: { origin: 'uncaughtException' },
    });
  });
});

describe('errorHandler', () => {
  it('reports, then passes the same error on (an Express error middleware)', async () => {
    init({ ...OPTIONS, captureUncaught: false });
    const handler = errorHandler();
    const next = vi.fn();
    const error = new Error('route failed');

    expect(handler.length).toBe(4); // Express detects error middleware by arity
    handler(error, { method: 'GET', url: '/orders' }, {}, next);

    expect(next).toHaveBeenCalledWith(error);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(sentBody()).toMatchObject({
      handled: false,
      request: { method: 'GET', url: '/orders' },
    });
  });
});

describe('onRequestError (Next.js)', () => {
  it('reports with the route as tags', async () => {
    init({ ...OPTIONS, captureUncaught: false });

    await onRequestError(
      new Error('render failed'),
      { path: '/orders/7?x=1', method: 'GET', headers: { 'user-agent': 'Mozilla/5.0' } },
      { routerKind: 'App Router', routePath: '/orders/[id]', routeType: 'render' },
    );

    expect(sentBody()).toMatchObject({
      handled: false,
      request: { method: 'GET', url: '/orders/7', userAgent: 'Mozilla/5.0' },
      tags: { routerKind: 'App Router', routePath: '/orders/[id]', routeType: 'render' },
    });
  });
});

describe('normalizeRequest', () => {
  it('handles Fetch API requests and absolute URLs', () => {
    const request = new Request('https://shop.example.com/cart?coupon=x', {
      method: 'PUT',
      headers: { 'user-agent': 'UA' },
    });

    expect(normalizeRequest(request as any)).toEqual({
      method: 'PUT',
      url: 'https://shop.example.com/cart',
      userAgent: 'UA',
    });
  });
});

describe('withGhostwire', () => {
  it('proxies only the tracking endpoints under /_gw', async () => {
    const { withGhostwire } = await import('./next');
    const config = withGhostwire({ reactStrictMode: true }, { host: 'https://gw.example.com/' });

    expect(config.reactStrictMode).toBe(true);
    const rewrites = (await config.rewrites()) as { source: string; destination: string }[];
    expect(rewrites).toContainEqual({
      source: '/_gw/script.js',
      destination: 'https://gw.example.com/script.js',
    });
    expect(rewrites).toContainEqual({
      source: '/_gw/api/send',
      destination: 'https://gw.example.com/api/send',
    });
    expect(rewrites.every(rewrite => rewrite.source.startsWith('/_gw/'))).toBe(true);
  });

  it('keeps the app’s own rewrites', async () => {
    const { withGhostwire } = await import('./next');
    const mine = { source: '/old', destination: '/new' };

    const list = withGhostwire({ rewrites: async () => [mine] }, { host: 'https://gw', path: 'a' });
    const listed = (await list.rewrites()) as { source: string }[];
    expect(listed.at(-1)).toBe(mine);
    expect(listed[0].source).toBe('/a/script.js');

    const phased = withGhostwire(
      { rewrites: () => ({ afterFiles: [mine] }) },
      { host: 'https://gw' },
    );
    const result = (await phased.rewrites()) as { beforeFiles: unknown[]; afterFiles: unknown[] };
    expect(result.afterFiles).toEqual([mine]);
    expect(result.beforeFiles).toHaveLength(5);
  });
});
