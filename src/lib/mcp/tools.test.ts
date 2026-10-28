import { beforeEach, describe, expect, test, vi } from 'vitest';

const createApiKey = vi.fn();
const canUpdateWebsite = vi.fn();
const getWebsite = vi.fn();

vi.mock('@/lib/better-auth', () => ({ auth: { api: { createApiKey } } }));
vi.mock('@/permissions', () => ({
  canCreateWebsite: vi.fn(),
  canUpdateWebsite,
  canViewAuthenticatedWebsite: vi.fn(),
  canViewWebsite: vi.fn(),
}));
vi.mock('@/queries/prisma', () => ({
  createWebsite: vi.fn(),
  getUserWebsites: vi.fn(),
  getWebsite,
  updateWebsite: vi.fn(),
}));
vi.mock('@/queries/sql', () => ({}));

const { buildTools } = await import('./tools');

const site = '0b8a3c6e-4f4e-4c55-9f7c-2a1f6e0c9d11';
const owner = { user: { id: 'u1', username: 'jane', role: 'user', isAdmin: false } } as any;

const tool = (auth: any) => buildTools(auth, 'https://analytics.example.com').find(t => t.name === 'ghostwire_create_read_key')!;

beforeEach(() => {
  createApiKey.mockReset();
  canUpdateWebsite.mockReset();
  getWebsite.mockReset();
  canUpdateWebsite.mockResolvedValue(true);
  getWebsite.mockResolvedValue({ id: site, name: 'The Unbroken Table' });
  createApiKey.mockResolvedValue({ id: 'k1', name: 'Read: The Unbroken Table', key: 'gwa_secret', expiresAt: null });
});

describe('ghostwire_create_read_key', () => {
  test('issues a key scoped to one site, for the caller, shown once', async () => {
    const result = await tool(owner).handler({ websiteId: site });

    expect(createApiKey).toHaveBeenCalledWith({
      body: {
        userId: 'u1',
        name: 'Read: The Unbroken Table',
        metadata: { kind: 'website-read', websiteId: site },
      },
    });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      websiteId: site,
      key: 'gwa_secret',
      allows: expect.arrayContaining([`GET https://analytics.example.com/api/websites/${site}/stats`]),
    });
  });

  test('can expire, and keeps names within the key limit', async () => {
    await tool(owner).handler({ websiteId: site, name: 'x'.repeat(40), expiresInDays: 30 });
    expect(createApiKey.mock.calls[0]![0].body).toMatchObject({ expiresIn: 30 * 86400, name: 'x'.repeat(32) });
  });

  test('refuses someone who may not manage the site', async () => {
    canUpdateWebsite.mockResolvedValue(false);
    const result = await tool(owner).handler({ websiteId: site });
    expect(result.isError).toBe(true);
    expect(createApiKey).not.toHaveBeenCalled();
  });

  test('refuses a read key trying to mint keys', async () => {
    const readKey = { ...owner, apiKey: { id: 'k0', name: 'r', scope: { kind: 'website-read', websiteId: site } } };
    const result = await tool(readKey).handler({ websiteId: site });
    expect(result.isError).toBe(true);
    expect(createApiKey).not.toHaveBeenCalled();
  });

  test('refuses a caller without a user (a share token)', async () => {
    const result = await tool({ user: null, shareToken: { websiteId: site } }).handler({ websiteId: site });
    expect(result.isError).toBe(true);
  });

  test('is described as not read-only and not destructive', () => {
    expect(tool(owner).annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });
});
