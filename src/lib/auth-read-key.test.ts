import { beforeEach, describe, expect, test, vi } from 'vitest';

/*
 * Website read keys are enforced where every API key is checked (checkApiKeyAuth), so these
 * tests go through checkAuth with real request paths rather than calling the scope helper.
 */

const verifyApiKey = vi.fn();
const findUnique = vi.fn();

vi.mock('@/lib/better-auth', () => ({ auth: { api: { verifyApiKey, getSession: vi.fn() } } }));
vi.mock('@/lib/prisma', () => ({ default: { client: { user: { findUnique } } } }));

const { checkAuth } = await import('./auth');

const site = '0b8a3c6e-4f4e-4c55-9f7c-2a1f6e0c9d11';
const other = '9d2f1e3a-6b7c-4d8e-9f00-112233445566';

const request = (path: string, method = 'GET') =>
  new Request(`https://analytics.example.com${path}`, {
    method,
    headers: { authorization: 'Bearer gwa_testkey' },
  });

const keyWith = (metadata: unknown) => ({
  valid: true,
  key: { id: 'k1', name: 'Read: Example', referenceId: 'u1', metadata },
});

beforeEach(() => {
  verifyApiKey.mockReset();
  findUnique.mockReset();
  findUnique.mockResolvedValue({
    id: 'u1',
    username: 'jane',
    name: 'Jane',
    email: 'jane@example.com',
    role: 'user',
    image: null,
    banned: false,
  });
});

describe('a website read key', () => {
  const readKey = keyWith(JSON.stringify({ kind: 'website-read', websiteId: site }));

  test('authenticates reads of its own site, and carries its scope', async () => {
    verifyApiKey.mockResolvedValue(readKey);
    const auth = await checkAuth(request(`/api/websites/${site}/stats?startAt=0&endAt=1`));
    expect(auth).toMatchObject({
      authType: 'api-key',
      user: { id: 'u1' },
      apiKey: { id: 'k1', scope: { kind: 'website-read', websiteId: site } },
    });
  });

  test('is refused for another site, even one its owner can see', async () => {
    verifyApiKey.mockResolvedValue(readKey);
    expect(await checkAuth(request(`/api/websites/${other}/stats`))).toBeNull();
  });

  test('is refused for writes, raw data and other routes, including MCP', async () => {
    verifyApiKey.mockResolvedValue(readKey);
    expect(await checkAuth(request(`/api/websites/${site}/stats`, 'POST'))).toBeNull();
    expect(await checkAuth(request(`/api/websites/${site}`, 'DELETE'))).toBeNull();
    expect(await checkAuth(request(`/api/websites/${site}/sessions`))).toBeNull();
    expect(await checkAuth(request(`/api/websites/${site}/export`))).toBeNull();
    expect(await checkAuth(request('/api/websites'))).toBeNull();
    expect(await checkAuth(request('/api/mcp', 'POST'))).toBeNull();
  });

  test('never loads the owner for a refused request', async () => {
    verifyApiKey.mockResolvedValue(readKey);
    await checkAuth(request(`/api/websites/${other}/stats`));
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe('an ordinary API key', () => {
  test('still works everywhere it did, with no scope attached', async () => {
    verifyApiKey.mockResolvedValue(keyWith(null));
    const auth = await checkAuth(request(`/api/websites/${other}/sessions`));
    expect(auth).toMatchObject({ authType: 'api-key', apiKey: { id: 'k1' } });
    expect(auth && 'apiKey' in auth ? auth.apiKey : null).not.toHaveProperty('scope');
  });
});
