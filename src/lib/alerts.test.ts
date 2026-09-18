import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = {
  alertRule: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  alertLog: { count: vi.fn(), create: vi.fn() },
  notificationChannel: { findMany: vi.fn() },
  website: { findUnique: vi.fn() },
  errorEvent: { count: vi.fn() },
  websiteEvent: { count: vi.fn() },
};
const sendNotification = vi.fn();

vi.mock('@/lib/prisma', () => ({ default: { client } }));
vi.mock('@/lib/notify', () => ({
  appUrl: (path: string) => `https://gw${path}`,
  sendNotification,
}));

const { isTrafficDrop, notifyErrorSaved, runScheduledAlerts } = await import('./alerts');

const rule = (type: string, extra = {}) => ({
  id: `rule-${type}`,
  websiteId: 'w1',
  type,
  enabled: true,
  channelIds: ['c1'],
  parameters: null,
  lastTriggeredAt: null,
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  client.notificationChannel.findMany.mockResolvedValue([{ id: 'c1', type: 'slack', config: {} }]);
  client.website.findUnique.mockResolvedValue({ name: 'Shop' });
  client.alertLog.count.mockResolvedValue(0);
  client.alertRule.updateMany.mockResolvedValue({ count: 1 });
  sendNotification.mockResolvedValue(undefined);
});

const saved = {
  websiteId: 'w1',
  groupId: 'g1',
  isNew: true,
  regressed: false,
  type: 'TypeError',
  message: 'x is undefined',
  culprit: 'checkout.js in pay',
  source: 'browser',
  release: '2.4.1',
};

describe('notifyErrorSaved', () => {
  it('alerts on a new error with a link to it, and logs the delivery', async () => {
    client.alertRule.findUnique.mockResolvedValue(rule('error.new'));

    await notifyErrorSaved(saved);

    const [, notification] = sendNotification.mock.calls[0];
    expect(notification.title).toBe('New error on Shop: TypeError');
    expect(notification.url).toBe('https://gw/websites/w1/errors/g1');
    expect(notification.fields).toContainEqual({ name: 'Release', value: '2.4.1' });
    expect(client.alertLog.create.mock.calls[0][0].data).toMatchObject({ status: 'sent' });
  });

  it('logs a failed delivery instead of throwing', async () => {
    client.alertRule.findUnique.mockResolvedValue(rule('error.new'));
    sendNotification.mockRejectedValue(new Error('410 Gone'));

    await expect(notifyErrorSaved(saved)).resolves.toBeUndefined();
    expect(client.alertLog.create.mock.calls[0][0].data).toMatchObject({
      status: 'failed',
      error: '410 Gone',
    });
  });

  it('stays quiet for repeat errors, disabled rules and the hourly cap', async () => {
    await notifyErrorSaved({ ...saved, isNew: false });
    expect(client.alertRule.findUnique).not.toHaveBeenCalled();

    client.alertRule.findUnique.mockResolvedValue(rule('error.new', { enabled: false }));
    await notifyErrorSaved(saved);

    client.alertRule.findUnique.mockResolvedValue(rule('error.new'));
    client.alertLog.count.mockResolvedValue(20);
    await notifyErrorSaved(saved);

    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('uses the regression rule for a resolved error that came back', async () => {
    client.alertRule.findUnique.mockResolvedValue(rule('error.regression'));

    await notifyErrorSaved({ ...saved, isNew: false, regressed: true });

    expect(client.alertRule.findUnique.mock.calls[0][0].where.websiteId_type.type).toBe(
      'error.regression',
    );
    expect(sendNotification.mock.calls[0][1].title).toBe('Error is back on Shop: TypeError');
  });
});

describe('scheduled alerts', () => {
  it('detects traffic drops against the weekly baseline', () => {
    expect(isTrafficDrop(10, [40, 40, 40, 40], 50, 20).dropped).toBe(true);
    expect(isTrafficDrop(30, [40, 40, 40, 40], 50, 20).dropped).toBe(false);
    // Too little traffic to judge.
    expect(isTrafficDrop(0, [5, 5, 5, 5], 50, 20).dropped).toBe(false);
  });

  it('sends a spike alert once per window', async () => {
    client.alertRule.findMany.mockResolvedValue([
      rule('error.spike', { parameters: { count: 10 } }),
    ]);
    client.errorEvent.count.mockResolvedValue(12);

    await runScheduledAlerts(new Date('2026-09-19T12:00:00Z'));
    expect(sendNotification.mock.calls[0][1].title).toBe(
      'Error spike on Shop: 12 errors in 60 minutes',
    );

    client.alertRule.updateMany.mockResolvedValue({ count: 0 });
    await runScheduledAlerts(new Date('2026-09-19T12:05:00Z'));
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it('sends a traffic drop alert when page views fall away', async () => {
    client.alertRule.findMany.mockResolvedValue([rule('traffic.drop')]);
    client.websiteEvent.count.mockResolvedValueOnce(0).mockResolvedValue(60);

    await runScheduledAlerts(new Date('2026-09-19T12:00:00Z'));

    const [, notification] = sendNotification.mock.calls[0];
    expect(notification.title).toBe('Traffic drop on Shop');
    expect(notification.text).toContain('No page views in the last hour (usually about 60)');
  });
});
