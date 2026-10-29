import { beforeEach, describe, expect, it, vi } from 'vitest';

const prisma = {
  appSetting: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  website: { findUnique: vi.fn(), create: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma, default: { client: prisma } }));

const { ensureSelfWebsite, getSelfMonitoring, instanceName, readSelfMonitoring, setSelfMonitoring, SELF_WEBSITE_KEY } =
  await import('./self');
const { isIgnoredPath } = await import('./self-telemetry');

beforeEach(() => {
  vi.clearAllMocks();
  prisma.website.create.mockImplementation(async ({ data }) => ({ id: data.id, name: data.name, deletedAt: null }));
});

describe('the self-monitoring site', () => {
  it('is named after the host the instance is served on', () => {
    expect(instanceName({ APP_URL: 'https://analytics.example.com/x' })).toBe('analytics.example.com');
    expect(instanceName({ BETTER_AUTH_URL: 'http://localhost:8770' })).toBe('localhost:8770');
    expect(instanceName({ APP_URL: 'not a url' })).toBeTruthy();
  });

  it('is created once, with error reporting on, and remembered', async () => {
    prisma.appSetting.findUnique.mockResolvedValue(null);

    const website = await ensureSelfWebsite('admin-1');

    expect(prisma.website.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'admin-1', errorsEnabled: true, name: expect.stringMatching(/^Ghostwire Analytics \(/) }),
      }),
    );
    expect(prisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { key: SELF_WEBSITE_KEY, value: website.id } }),
    );
  });

  it('reuses the stored site, and recreates it if it was deleted', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: 'site-1' });
    prisma.website.findUnique.mockResolvedValue({ id: 'site-1', name: 'Mine', deletedAt: null });
    expect((await ensureSelfWebsite('admin-1')).id).toBe('site-1');
    expect(prisma.website.create).not.toHaveBeenCalled();

    prisma.website.findUnique.mockResolvedValue({ id: 'site-1', name: 'Mine', deletedAt: new Date() });
    expect((await ensureSelfWebsite('admin-1')).id).not.toBe('site-1');
  });
});

describe('the switch', () => {
  it('turns on with a site, and off without touching it', async () => {
    prisma.appSetting.findUnique.mockResolvedValue({ value: 'site-1' });
    prisma.website.findUnique.mockResolvedValue({ id: 'site-1', name: 'Mine', deletedAt: null });

    expect(await setSelfMonitoring(true, 'admin-1')).toEqual({ enabled: true, websiteId: 'site-1' });
    expect(prisma.appSetting.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({ update: { value: 'true' } }),
    );

    prisma.appSetting.findMany.mockResolvedValue([
      { key: 'self_monitoring', value: 'false' },
      { key: SELF_WEBSITE_KEY, value: 'site-1' },
    ]);
    expect(await setSelfMonitoring(false, 'admin-1')).toEqual({ enabled: false, websiteId: 'site-1' });
    expect(prisma.website.create).not.toHaveBeenCalled();
  });

  it('counts as off without a site, and when the setting can’t be read', async () => {
    prisma.appSetting.findMany.mockResolvedValue([{ key: 'self_monitoring', value: 'true' }]);
    expect(await readSelfMonitoring()).toEqual({ enabled: false, websiteId: null });

    prisma.appSetting.findMany.mockRejectedValue(new Error('db down'));
    await setSelfMonitoring(false, 'x').catch(() => {});
    expect((await getSelfMonitoring()).enabled).toBe(false);
  });
});

describe('self telemetry', () => {
  it('never traces the OTLP receivers, health checks or static files', () => {
    expect(isIgnoredPath('/v1/traces')).toBe(true);
    expect(isIgnoredPath('/api/heartbeat')).toBe(true);
    expect(isIgnoredPath('/_next/static/chunks/a.js')).toBe(true);
    expect(isIgnoredPath('/api/websites')).toBe(false);
    expect(isIgnoredPath(undefined)).toBe(false);
  });
});
