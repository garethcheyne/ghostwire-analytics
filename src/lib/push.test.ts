import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = {
  appSetting: { findUnique: vi.fn(), createMany: vi.fn() },
  pushSubscription: {
    findMany: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
    upsert: vi.fn(),
  },
  member: { findMany: vi.fn() },
};
const webPush = { sendNotification: vi.fn(), generateVAPIDKeys: vi.fn() };

vi.mock('@/lib/prisma', () => ({ default: { client } }));
vi.mock('web-push', () => ({ default: webPush }));

const { channelRecipients, getVapidKeys, sendPush, sendPushNotification, toPayload, vapidSubject } =
  await import('./push');

const device = (id: string) => ({
  id,
  userId: 'u1',
  endpoint: `https://push.example.com/${id}`,
  p256dh: 'key',
  auth: 'secret',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VAPID_PUBLIC_KEY', 'public');
  vi.stubEnv('VAPID_PRIVATE_KEY', 'private');
  client.pushSubscription.findMany.mockResolvedValue([device('a')]);
  webPush.sendNotification.mockResolvedValue({ statusCode: 201 });
});

describe('push notifications', () => {
  it('turns an alert into a short notification', () => {
    const payload = toPayload({
      event: 'error.new',
      level: 'danger',
      title: 'New error on Shop',
      text: 'TypeError: x is undefined',
      url: 'https://gw/websites/w1/errors/g1',
      fields: [{ name: 'Release', value: '1.2.0' }],
    });

    expect(payload).toEqual({
      title: 'New error on Shop',
      body: 'TypeError: x is undefined\nRelease: 1.2.0',
      url: 'https://gw/websites/w1/errors/g1',
      tag: 'error.new',
      level: 'danger',
    });
  });

  it('sends to every device and removes expired ones', async () => {
    client.pushSubscription.findMany.mockResolvedValue([device('a'), device('b'), device('c')]);
    webPush.sendNotification
      .mockResolvedValueOnce({ statusCode: 201 })
      .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }))
      .mockRejectedValueOnce(Object.assign(new Error('Bad'), { statusCode: 400, body: 'bad key' }));

    const result = await sendPush(['u1'], { title: 'Hi', body: 'There' });

    expect(result).toEqual({ sent: 1, failed: 1, removed: 1, errors: ['400: bad key'] });
    expect(client.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: 'b' } });
    const [target, body, options] = webPush.sendNotification.mock.calls[0];
    expect(target).toEqual({
      endpoint: 'https://push.example.com/a',
      keys: { p256dh: 'key', auth: 'secret' },
    });
    expect(JSON.parse(body)).toEqual({ title: 'Hi', body: 'There' });
    expect(options.vapidDetails).toMatchObject({ publicKey: 'public', privateKey: 'private' });
  });

  it('reaches the owner of a personal channel, or the whole team', async () => {
    client.member.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);

    expect(await channelRecipients({ userId: 'u9', teamId: null })).toEqual(['u9']);
    expect(await channelRecipients({ userId: 'u9', teamId: 't1' })).toEqual(['u1', 'u2']);
    expect(client.member.findMany).toHaveBeenCalledWith({
      where: { organizationId: 't1' },
      select: { userId: true },
    });
  });

  it('fails an alert delivery when no device has notifications on', async () => {
    client.pushSubscription.findMany.mockResolvedValue([]);

    await expect(
      sendPushNotification({ userId: 'u1' }, { event: 'test', title: 'T', text: '' }),
    ).rejects.toThrow(/No devices/);
  });

  it('generates VAPID keys once and keeps them when none are configured', async () => {
    vi.stubEnv('VAPID_PUBLIC_KEY', '');
    const keys = { publicKey: 'gen-public', privateKey: 'gen-private' };
    webPush.generateVAPIDKeys.mockReturnValue(keys);
    client.appSetting.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ key: 'vapid_keys', value: JSON.stringify(keys) });

    expect(await getVapidKeys()).toEqual(keys);
    expect(client.appSetting.createMany).toHaveBeenCalledWith({
      data: [{ key: 'vapid_keys', value: JSON.stringify(keys) }],
      skipDuplicates: true,
    });
    // Cached afterwards.
    expect(await getVapidKeys()).toEqual(keys);
    expect(client.appSetting.findUnique).toHaveBeenCalledTimes(2);
  });

  it('uses the https app address as the VAPID contact', () => {
    vi.stubEnv('VAPID_SUBJECT', '');
    vi.stubEnv('APP_URL', 'https://analytics.example.com/');
    expect(vapidSubject()).toBe('https://analytics.example.com');

    vi.stubEnv('APP_URL', 'http://localhost:3000');
    vi.stubEnv('BETTER_AUTH_URL', '');
    expect(vapidSubject()).toMatch(/^mailto:/);
  });
});
