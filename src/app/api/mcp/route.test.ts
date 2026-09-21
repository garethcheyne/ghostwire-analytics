import { beforeEach, expect, test, vi } from 'vitest';
import { checkAuth } from '@/lib/auth';
import { GET, POST } from './route';

vi.mock('@/lib/auth', () => ({ checkAuth: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/mcp/tools', () => ({ buildTools: () => [] }));

const checkAuthMock = vi.mocked(checkAuth);

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('https://analytics.example.com/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

beforeEach(() => {
  checkAuthMock.mockReset();
  checkAuthMock.mockResolvedValue({ user: { id: 'u1', username: 'jane' } } as any);
});

test('refuses a caller without a user, so a share token cannot provision sites', async () => {
  // A share token can read one dashboard; that is not the same as holding the
  // keys to create websites or issue ingest keys.
  checkAuthMock.mockResolvedValue({ user: null, shareToken: { websiteId: 'w1' } } as any);

  const response = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toMatchObject({ error: { message: expect.stringContaining('gwa_') } });
});

test('answers initialize for an authenticated caller', async () => {
  const response = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    result: { serverInfo: { name: 'ghostwire-analytics' } },
  });
});

test('acknowledges a notification with 202 and an empty body', async () => {
  // Required by the Streamable HTTP transport: a notification takes no reply.
  const response = await post({ jsonrpc: '2.0', method: 'notifications/initialized' });

  expect(response.status).toBe(202);
  await expect(response.text()).resolves.toBe('');
});

test('rejects an unsupported protocol version outright', async () => {
  const response = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {
    'mcp-protocol-version': '1999-01-01',
  });

  expect(response.status).toBe(400);
});

test('accepts a request with no protocol version header', async () => {
  // The specification says to assume an older version rather than refuse.
  const response = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

  expect(response.status).toBe(200);
});

test('refuses a batch rather than silently answering the first message', async () => {
  const response = await post([
    { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ]);

  expect(response.status).toBe(400);
});

test('rejects a body that is not JSON', async () => {
  const response = await post('not json at all');

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ error: { code: -32700 } });
});

test('refuses a cross-site Origin, which is the DNS-rebinding guard', async () => {
  const response = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {
    origin: 'https://evil.example',
  });

  expect(response.status).toBe(403);
});

test('allows a same-origin browser request', async () => {
  const response = await post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {
    origin: 'https://analytics.example.com',
  });

  expect(response.status).toBe(200);
});

test('declines to open an SSE stream on GET', async () => {
  // This server never sends server-initiated messages; the transport allows
  // declining with 405 and clients handle it.
  expect(GET().status).toBe(405);
});
