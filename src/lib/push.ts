/*
 * Web Push: VAPID keys, and delivery to people's subscribed browsers and installed apps.
 * The keys come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY, or are generated once and kept in
 * app_setting, so push works without any setup. Changing the keys invalidates every subscription.
 */
import type { Notification } from '@/lib/notify';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';

const SETTING_KEY = 'vapid_keys';
/** How long a push service keeps a message for a device that's offline. */
const TTL_SECONDS = 24 * 60 * 60;

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** Notifications with the same tag replace each other on the device. */
  tag?: string;
  level?: Notification['level'];
}

async function webPush() {
  return (await import('web-push')).default;
}

let cachedKeys: VapidKeys | undefined;

export async function getVapidKeys(): Promise<VapidKeys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  if (cachedKeys) return cachedKeys;

  const stored = await prisma.client.appSetting.findUnique({ where: { key: SETTING_KEY } });

  if (!stored) {
    const generated = (await webPush()).generateVAPIDKeys();
    // Two instances starting together: the first insert wins and both read it back.
    await prisma.client.appSetting.createMany({
      data: [{ key: SETTING_KEY, value: JSON.stringify(generated) }],
      skipDuplicates: true,
    });
    return getVapidKeys();
  }

  cachedKeys = JSON.parse(stored.value) as VapidKeys;
  return cachedKeys;
}

/** Push services want a contact: VAPID_SUBJECT, else the app's https address. */
export function vapidSubject() {
  if (process.env.VAPID_SUBJECT) return process.env.VAPID_SUBJECT;

  const base = process.env.APP_URL || process.env.BETTER_AUTH_URL || '';
  return /^https:\/\//i.test(base) ? base.replace(/\/+$/, '') : 'mailto:admin@example.com';
}

export function toPayload(notification: Notification): PushPayload {
  return {
    title: notification.title.slice(0, 200),
    body: [notification.text, ...(notification.fields ?? []).map(f => `${f.name}: ${f.value}`)]
      .filter(Boolean)
      .join('\n')
      .slice(0, 1000),
    url: notification.url,
    tag: notification.event,
    level: notification.level,
  };
}

export interface PushResult {
  sent: number;
  failed: number;
  removed: number;
  errors: string[];
}

/** Sends to every device of the given users. Expired subscriptions (404/410) are deleted. */
export async function sendPush(userIds: string[], payload: PushPayload): Promise<PushResult> {
  const result: PushResult = { sent: 0, failed: 0, removed: 0, errors: [] };
  if (!userIds.length) return result;

  const subscriptions = await prisma.client.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (!subscriptions.length) return result;

  const [push, keys] = await Promise.all([webPush(), getVapidKeys()]);
  const body = JSON.stringify(payload);
  const options = {
    TTL: TTL_SECONDS,
    urgency: payload.level === 'danger' ? ('high' as const) : ('normal' as const),
    vapidDetails: { subject: vapidSubject(), ...keys },
    timeout: 10_000,
  };

  await Promise.all(
    subscriptions.map(async subscription => {
      try {
        await push.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          body,
          options,
        );
        result.sent++;
        await prisma.client.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastUsedAt: new Date() },
        });
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          result.removed++;
          await prisma.client.pushSubscription.deleteMany({ where: { id: subscription.id } });
        } else {
          result.failed++;
          result.errors.push(
            [e?.statusCode, e?.body || e?.message || String(e)].filter(Boolean).join(': '),
          );
        }
      }
    }),
  );

  return result;
}

/** The people a push channel reaches: its owner, or every member of its team. */
export async function channelRecipients(channel: {
  userId?: string | null;
  teamId?: string | null;
}) {
  if (channel.teamId) {
    const members = await prisma.client.member.findMany({
      where: { organizationId: channel.teamId },
      select: { userId: true },
    });
    return members.map(m => m.userId);
  }

  return channel.userId ? [channel.userId] : [];
}

/** Delivery for alert channels: fails when no device received it, so the alert log says why. */
export async function sendPushNotification(
  channel: { userId?: string | null; teamId?: string | null },
  notification: Notification,
) {
  const result = await sendPush(await channelRecipients(channel), toPayload(notification));

  if (!result.sent) {
    throw new Error(
      result.errors[0] ??
        'No devices have notifications turned on (Settings → Notifications → This device).',
    );
  }

  return result;
}

export async function saveSubscription(
  userId: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string | null,
) {
  const data = {
    userId,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: userAgent?.slice(0, 500) || null,
  };

  // An endpoint belongs to one browser profile; whoever subscribes last owns it.
  return prisma.client.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { id: uuid(), endpoint: subscription.endpoint, ...data },
    update: data,
  });
}
