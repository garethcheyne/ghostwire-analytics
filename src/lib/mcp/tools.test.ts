import { beforeEach, describe, expect, test, vi } from 'vitest';

const createApiKey = vi.fn();
const canUpdateWebsite = vi.fn();
const getWebsite = vi.fn();

vi.mock('@/lib/better-auth', () => ({ auth: { api: { createApiKey } } }));
vi.mock('@/permissions', () => ({
  canCreateWebsite: vi.fn(),
  canUpdateWebsite,
  canViewAuthenticatedWebsite: vi.fn(),
  canViewWebsite: (...args: unknown[]) => canViewWebsite(...args),
}));
vi.mock('@/queries/prisma', () => ({
  createWebsite: vi.fn(),
  getUserWebsites: vi.fn(),
  getWebsite,
  updateWebsite: vi.fn(),
}));
const getSessionMetrics = vi.fn();
const getPageviewStats = vi.fn();
const getSessionStats = vi.fn();
const canViewWebsite = vi.fn();
const logError = vi.fn();

vi.mock('@/lib/logger', () => ({ log: { error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/queries/sql', () => ({ getSessionMetrics, getPageviewStats, getSessionStats }));
const getSystemServices = vi.fn();
const getEndpoints = vi.fn();
const getTraces = vi.fn();
vi.mock('@/queries/sql/system', () => ({ getSystemServices, getEndpoints, getTraces }));

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

  test('can expire, and keeps the default name within the key limit', async () => {
    getWebsite.mockResolvedValue({ id: site, name: 'y'.repeat(40) });
    await tool(owner).handler({ websiteId: site, expiresInDays: 30 });
    expect(createApiKey.mock.calls[0]![0].body).toMatchObject({ expiresIn: 30 * 86400, name: `Read: ${'y'.repeat(26)}` });
  });

  test('refuses arguments outside its schema before doing anything', async () => {
    for (const args of [{ websiteId: site, name: 'x'.repeat(40) }, { websiteId: 'not-a-uuid' }, { websiteId: site, expiresInDays: 0.5 }]) {
      const result = await tool(owner).handler(args);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/^Invalid arguments/);
    }
    expect(canUpdateWebsite).not.toHaveBeenCalled();
    expect(createApiKey).not.toHaveBeenCalled();
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

describe('argument validation on the reading tools', () => {
  const named = (name: string) => buildTools(owner, 'https://analytics.example.com').find(t => t.name === name)!;

  beforeEach(() => {
    canViewWebsite.mockReset().mockResolvedValue(true);
    getSessionMetrics.mockReset().mockResolvedValue([{ x: 'Firefox', y: 3 }]);
    getPageviewStats.mockReset().mockResolvedValue([]);
    getSessionStats.mockReset().mockResolvedValue([]);
    logError.mockReset();
  });

  test('a metrics type outside the list never reaches the query', async () => {
    const result = await named('ghostwire_get_metrics').handler({
      websiteId: site,
      type: '(select password from "user" limit 1)',
    });
    expect(result.isError).toBe(true);
    expect(getSessionMetrics).not.toHaveBeenCalled();
  });

  test('a limit that is not a small integer never reaches the query', async () => {
    const result = await named('ghostwire_get_metrics').handler({ websiteId: site, type: 'browser', limit: '1 union select 1' });
    expect(result.isError).toBe(true);
    expect(getSessionMetrics).not.toHaveBeenCalled();
  });

  test('a time series unit outside the list never reaches the query', async () => {
    const result = await named('ghostwire_get_timeseries').handler({ websiteId: site, unit: "day', now()) --" });
    expect(result.isError).toBe(true);
    expect(getPageviewStats).not.toHaveBeenCalled();
  });

  test('valid arguments run the query', async () => {
    const result = await named('ghostwire_get_metrics').handler({ websiteId: site, type: 'browser', limit: 5 });
    expect(result.isError).toBeUndefined();
    expect(getSessionMetrics).toHaveBeenCalledWith(site, { type: 'browser', limit: 5 }, expect.anything());
  });

  test('an unexpected failure is logged, not shown to the caller', async () => {
    getSessionMetrics.mockRejectedValue(new Error('relation "secret_table" does not exist'));
    const result = await named('ghostwire_get_metrics').handler({ websiteId: site, type: 'browser' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).not.toContain('secret_table');
    expect(logError).toHaveBeenCalledWith('mcp.tool_failed', expect.objectContaining({ tool: 'ghostwire_get_metrics' }));
  });

  test('its own refusals still reach the caller', async () => {
    canViewWebsite.mockResolvedValue(false);
    const result = await named('ghostwire_get_metrics').handler({ websiteId: site, type: 'browser' });
    expect(result.content[0]!.text).toContain('do not have access');
  });
});

describe('system monitoring tools', () => {
  const find = (name: string) => buildTools(owner, 'https://analytics.example.com').find(t => t.name === name)!;
  let canViewAuthenticated: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    canViewAuthenticated = vi.mocked((await import('@/permissions')).canViewAuthenticatedWebsite) as any;
    canViewAuthenticated.mockResolvedValue(true);
    getSystemServices.mockResolvedValue([
      {
        id: 's1',
        namespace: 'ghostwire-load',
        name: 'web',
        kind: 'app',
        status: 'down',
        statusReason: 'Stopped reporting',
        version: '1',
        environment: 'prod',
        lastSeen: '2026-10-29T10:00:00Z',
      },
    ]);
    getEndpoints.mockResolvedValue([
      { serviceId: 's1', method: 'GET', route: '/api/x', count: 10, errors: 1, rate: 0.5, errorRate: 0.1, p50: 5, p95: 40.123, p99: 50 },
    ]);
    getTraces.mockResolvedValue({
      count: 1,
      data: [
        {
          traceId: 'a'.repeat(32),
          service: 'web',
          name: 'GET /api/x',
          route: '/api/x',
          durationMs: 812.5,
          status: 2,
          httpStatus: 500,
          statusMessage: 'boom',
          spanCount: 4,
          startTime: '2026-10-29T10:00:00Z',
        },
      ],
    });
  });

  test('reports status with request figures, for the last hour by default', async () => {
    const result = await find('ghostwire_get_services_status').handler({ websiteId: site });
    expect(result.structuredContent).toMatchObject({
      services: [{ name: 'web', status: 'down', reason: 'Stopped reporting', requests: 10, errorRate: 0.1, worstEndpointP95Ms: 40.12 }],
    });
    const [, range] = getEndpoints.mock.calls[0];
    expect(range.endDate.getTime() - range.startDate.getTime()).toBe(60 * 60 * 1000);
  });

  test('lists endpoints and slow traces with links', async () => {
    const endpoints = await find('ghostwire_get_endpoint_stats').handler({ websiteId: site, limit: 5 });
    expect(endpoints.structuredContent).toMatchObject({ endpoints: [{ service: 'web', route: '/api/x', p95Ms: 40.12 }] });

    const traces = await find('ghostwire_get_slow_traces').handler({ websiteId: site, errorsOnly: true });
    expect(getTraces.mock.calls[0][1]).toMatchObject({ status: 'error', sort: 'slowest', pageSize: 20 });
    expect(traces.structuredContent).toMatchObject({
      traces: [{ failed: true, url: `https://analytics.example.com/websites/${site}/system/traces/${'a'.repeat(32)}` }],
    });
  });

  test('refuses sites the caller can only see through a share or read key', async () => {
    canViewAuthenticated.mockResolvedValue(false);
    const result = await find('ghostwire_get_slow_traces').handler({ websiteId: site });
    expect(result.isError).toBe(true);
    expect(getTraces).not.toHaveBeenCalled();
  });

  test('enforces the schema', async () => {
    const result = await find('ghostwire_get_endpoint_stats').handler({ websiteId: site, limit: 10_000 });
    expect(result.isError).toBe(true);
    expect(getEndpoints).not.toHaveBeenCalled();
  });
});
