import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSystemServices = vi.fn();
const getRequestTotals = vi.fn();
const getJobs = vi.fn();
const getInfrastructure = vi.fn();
const sendNotification = vi.fn();
const client = {
  alertRule: { findMany: vi.fn(), updateMany: vi.fn() },
  alertLog: { create: vi.fn() },
  notificationChannel: { findMany: vi.fn() },
  website: { findUnique: vi.fn() },
};

vi.mock('@/queries/sql/system', () => ({ getSystemServices, getRequestTotals, getJobs, getInfrastructure }));
vi.mock('@/lib/prisma', () => ({ default: { client } }));
vi.mock('@/lib/notify', () => ({ appUrl: (path: string) => `https://gw${path}`, sendNotification }));

const { evaluateSystemAlert } = await import('./alerts');
const { runScheduledAlerts } = await import('@/lib/alerts');

const now = Date.UTC(2026, 9, 29, 12);
const W = 'w1';
const service = (extra = {}) => ({ id: 's1', name: 'api', namespace: 'ghostwire-load', status: 'up', ...extra });
const stats = (extra = {}) => ({ count: 100, errors: 0, errorRate: 0, p95: 120, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  getSystemServices.mockResolvedValue([service()]);
  getRequestTotals.mockResolvedValue({ byService: new Map([['s1', stats()]]), total: null });
  getJobs.mockResolvedValue({ jobs: [], series: { points: [] } });
  getInfrastructure.mockResolvedValue({ containers: [], hosts: [] });
});

describe('evaluateSystemAlert', () => {
  it('reports services down for at least the given minutes', async () => {
    expect(await evaluateSystemAlert(W, 'system.down', { minutes: 5 }, now)).toBeNull();

    getSystemServices.mockResolvedValue([
      service({ status: 'down', downSince: now - 10 * 60_000, statusReason: 'Heartbeat stopped' }),
      service({ id: 's2', name: 'ui', status: 'down', downSince: now - 60_000 }),
    ]);
    const alert = await evaluateSystemAlert(W, 'system.down', { minutes: 5 }, now);
    expect(alert).toMatchObject({ event: 'system.down', level: 'danger', subject: 'api is down' });
    expect(alert!.text).toContain('Heartbeat stopped');
    expect(alert!.url).toBe('https://gw/websites/w1/system');
  });

  it('checks p95 latency per service over the window', async () => {
    expect(await evaluateSystemAlert(W, 'system.latency', { ms: 500, minutes: 5 }, now)).toBeNull();
    getRequestTotals.mockResolvedValue({ byService: new Map([['s1', stats({ p95: 2400 })]]) });
    const alert = await evaluateSystemAlert(W, 'system.latency', { ms: 500, minutes: 5 }, now);
    expect(alert?.text).toContain('api: p95 2.4 s');
    const [, filters] = getRequestTotals.mock.calls[0];
    expect(now - filters.startDate.getTime()).toBe(5 * 60_000);
  });

  it('checks the error rate only with enough requests', async () => {
    getRequestTotals.mockResolvedValue({ byService: new Map([['s1', stats({ count: 4, errorRate: 0.5 })]]) });
    expect(await evaluateSystemAlert(W, 'system.error_rate', { percent: 5, minutes: 5, minimum: 20 }, now)).toBeNull();

    getRequestTotals.mockResolvedValue({ byService: new Map([['s1', stats({ count: 200, errorRate: 0.1 })]]) });
    const alert = await evaluateSystemAlert(W, 'system.error_rate', { percent: 5, minutes: 5, minimum: 20 }, now);
    expect(alert?.text).toContain('10% of 200 requests failed');
  });

  it('reports failing jobs', async () => {
    getJobs.mockResolvedValue({
      jobs: [
        { job: 'collect', failures: 2, runs: 10, lastFailure: 'timeout' },
        { job: 'scan', failures: 0, runs: 5 },
      ],
    });
    const alert = await evaluateSystemAlert(W, 'system.job_failure', { count: 1, minutes: 15 }, now);
    expect(alert?.subject).toBe('Job collect failing');
    expect(alert?.text).toBe('collect: 2 of 10 runs failed (timeout)');
  });

  it('reports containers and hosts over the CPU or memory limit', async () => {
    getInfrastructure.mockResolvedValue({
      containers: [
        { name: 'api', cpuPercent: 95, memoryPercent: 40 },
        { name: 'db', cpuPercent: 10, memoryPercent: 97 },
      ],
      hosts: [{ name: 'box', cpuPercent: 50, memoryPercent: null }],
    });
    expect((await evaluateSystemAlert(W, 'system.cpu', { percent: 90, minutes: 10 }, now))?.subject).toBe(
      'CPU above 90%: api',
    );
    expect((await evaluateSystemAlert(W, 'system.memory', { percent: 90, minutes: 5 }, now))?.subject).toBe(
      'Memory above 90%: db',
    );
  });
});

describe('scheduled system alerts', () => {
  const rule = {
    id: 'r1',
    websiteId: W,
    type: 'system.down',
    enabled: true,
    channelIds: ['c1'],
    parameters: { minutes: 5 },
    lastTriggeredAt: null,
  };

  beforeEach(() => {
    client.alertRule.findMany.mockResolvedValue([rule]);
    client.alertRule.updateMany.mockResolvedValue({ count: 1 });
    client.notificationChannel.findMany.mockResolvedValue([{ id: 'c1', type: 'slack', config: {} }]);
    client.website.findUnique.mockResolvedValue({ name: 'Ghostwire Load' });
    getSystemServices.mockResolvedValue([service({ status: 'down', downSince: now - 30 * 60_000 })]);
  });

  it('sends through the rule channels and claims the rule for the cooldown', async () => {
    await runScheduledAlerts(new Date(now));

    expect(client.alertRule.findMany.mock.calls[0][0].where.type.in).toContain('system.down');
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      expect.objectContaining({ event: 'system.down', title: 'api is down on Ghostwire Load' }),
    );
    const since = client.alertRule.updateMany.mock.calls[0][0].where.OR[1].lastTriggeredAt.lt;
    expect(now - since.getTime()).toBe(6 * 60 * 60 * 1000);
    expect(client.alertLog.create).toHaveBeenCalled();
  });

  it("doesn't send again while the rule is claimed", async () => {
    client.alertRule.updateMany.mockResolvedValue({ count: 0 });
    await runScheduledAlerts(new Date(now));
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('sends nothing when all is well', async () => {
    getSystemServices.mockResolvedValue([service()]);
    await runScheduledAlerts(new Date(now));
    expect(client.alertRule.updateMany).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
