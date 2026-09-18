/*
 * Alert rules: what to watch for on a website, and where to send it.
 *   error.new         an error group seen for the first time
 *   error.regression  a resolved error that happened again
 *   error.spike       at least `count` errors within `minutes`
 *   traffic.drop      page views in the last hour at least `percent` below the same hour on the
 *                     previous four weeks (only when that baseline is at least `minimum`)
 * The error alerts are sent right after the error is saved; the others run every 5 minutes.
 */
import { after } from 'next/server';
import { uuid } from '@/lib/crypto';
import { appUrl, type Channel, type Notification, sendNotification } from '@/lib/notify';
import prisma from '@/lib/prisma';

export const ALERT_TYPES = [
  'error.new',
  'error.regression',
  'error.spike',
  'traffic.drop',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const ALERT_DEFAULTS: Record<AlertType, Record<string, number>> = {
  'error.new': {},
  'error.regression': {},
  'error.spike': { count: 50, minutes: 60 },
  'traffic.drop': { percent: 50, minimum: 20 },
};

/** Error alerts per rule per hour, so a bad deploy doesn't send hundreds of messages. */
const HOURLY_CAP = 20;
const DROP_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const INTERVAL_MS = 5 * 60 * 1000;

interface Rule {
  id: string;
  websiteId: string;
  type: string;
  channelIds: string[];
  parameters: unknown;
}

function params(rule: Rule) {
  const defaults = ALERT_DEFAULTS[rule.type as AlertType] ?? {};
  const given = (rule.parameters ?? {}) as Record<string, unknown>;

  return Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => {
      const n = Number(given[key]);
      return [key, Number.isFinite(n) && n > 0 ? n : value];
    }),
  ) as Record<string, number>;
}

async function getRule(websiteId: string, type: AlertType) {
  const rule = await prisma.client.alertRule.findUnique({
    where: { websiteId_type: { websiteId, type } },
  });

  return rule?.enabled && rule.channelIds.length ? rule : null;
}

/** Marks a rule as fired unless it already fired since `since`; true for the one caller that wins. */
async function claim(ruleId: string, since: Date, now = new Date()) {
  const { count } = await prisma.client.alertRule.updateMany({
    where: {
      id: ruleId,
      OR: [{ lastTriggeredAt: null }, { lastTriggeredAt: { lt: since } }],
    },
    data: { lastTriggeredAt: now },
  });

  return count === 1;
}

/** Sends a notification to each of the rule's channels and records the outcome. */
export async function dispatch(rule: Rule, notification: Notification) {
  const channels = await prisma.client.notificationChannel.findMany({
    where: { id: { in: rule.channelIds } },
  });

  await Promise.all(
    channels.map(async channel => {
      let error: string | null = null;

      try {
        await sendNotification(channel as unknown as Channel, notification);
      } catch (e) {
        error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      }

      await prisma.client.alertLog.create({
        data: {
          id: uuid(),
          websiteId: rule.websiteId,
          ruleId: rule.id,
          channelId: channel.id,
          type: rule.type,
          title: notification.title.slice(0, 500),
          status: error ? 'failed' : 'sent',
          error,
        },
      });
    }),
  );
}

async function websiteName(websiteId: string) {
  const website = await prisma.client.website.findUnique({
    where: { id: websiteId },
    select: { name: true },
  });

  return website?.name ?? 'your website';
}

export interface SavedError {
  websiteId: string;
  groupId: string;
  isNew: boolean;
  regressed: boolean;
  type: string;
  message: string;
  culprit?: string | null;
  urlPath?: string | null;
  release?: string | null;
  environment?: string | null;
  source: string;
}

/** Runs a task after the response is sent (or straight away outside a request). */
export function afterResponse(task: () => Promise<unknown>) {
  try {
    after(task);
  } catch {
    void task().catch(() => {});
  }
}

/** Alerts for a just-saved error, when it's new or a regression. Never throws. */
export async function notifyErrorSaved(error: SavedError) {
  try {
    const type: AlertType | null = error.isNew
      ? 'error.new'
      : error.regressed
        ? 'error.regression'
        : null;
    if (!type) return;

    const rule = await getRule(error.websiteId, type);
    if (!rule) return;

    const recent = await prisma.client.alertLog.count({
      where: { ruleId: rule.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    });
    if (recent >= HOURLY_CAP * Math.max(rule.channelIds.length, 1)) return;

    const name = await websiteName(error.websiteId);
    const fields = [
      { name: 'Source', value: error.source },
      ...(error.culprit ? [{ name: 'Where', value: error.culprit }] : []),
      ...(error.urlPath ? [{ name: 'Page', value: error.urlPath }] : []),
      ...(error.release ? [{ name: 'Release', value: error.release }] : []),
      ...(error.environment ? [{ name: 'Environment', value: error.environment }] : []),
    ];

    await dispatch(rule, {
      event: type,
      level: 'danger',
      title: `${type === 'error.new' ? 'New error' : 'Error is back'} on ${name}: ${error.type}`,
      text:
        type === 'error.new'
          ? error.message
          : `This error was resolved and has happened again.\n${error.message}`,
      url: appUrl(`/websites/${error.websiteId}/errors/${error.groupId}`),
      fields,
      data: { websiteId: error.websiteId, groupId: error.groupId, release: error.release },
    });
  } catch (e) {
    console.error('Error alert failed:', e);
  }
}

async function checkSpike(rule: Rule, now: Date) {
  const { count, minutes } = params(rule);
  const since = new Date(now.getTime() - minutes * 60 * 1000);
  const total = await prisma.client.errorEvent.count({
    where: { websiteId: rule.websiteId, createdAt: { gte: since } },
  });

  if (total < count || !(await claim(rule.id, since, now))) return;

  const name = await websiteName(rule.websiteId);
  await dispatch(rule, {
    event: 'error.spike',
    level: 'danger',
    title: `Error spike on ${name}: ${total} errors in ${minutes} minutes`,
    text: `At least ${count} errors within ${minutes} minutes.`,
    url: appUrl(`/websites/${rule.websiteId}/errors`),
    data: { websiteId: rule.websiteId, count: total, minutes },
  });
}

/** Page views in the hour ending at `end` and in the same hour 1-4 weeks earlier. */
async function hourlyViews(websiteId: string, end: Date) {
  const hour = 60 * 60 * 1000;
  const week = 7 * 24 * hour;
  const windows = [0, 1, 2, 3, 4].map(weeks => {
    const to = new Date(end.getTime() - weeks * week);
    return { from: new Date(to.getTime() - hour), to };
  });

  return Promise.all(
    windows.map(({ from, to }) =>
      prisma.client.websiteEvent.count({
        where: { websiteId, eventType: 1, createdAt: { gte: from, lt: to } },
      }),
    ),
  );
}

export function isTrafficDrop(
  current: number,
  previous: number[],
  percent: number,
  minimum: number,
) {
  const baseline = previous.reduce((sum, n) => sum + n, 0) / Math.max(previous.length, 1);
  return { baseline, dropped: baseline >= minimum && current <= baseline * (1 - percent / 100) };
}

async function checkTrafficDrop(rule: Rule, now: Date) {
  const { percent, minimum } = params(rule);
  const [current, ...previous] = await hourlyViews(rule.websiteId, now);
  const { baseline, dropped } = isTrafficDrop(current, previous, percent, minimum);

  if (!dropped || !(await claim(rule.id, new Date(now.getTime() - DROP_COOLDOWN_MS), now))) return;

  const name = await websiteName(rule.websiteId);
  await dispatch(rule, {
    event: 'traffic.drop',
    level: 'warning',
    title: `Traffic drop on ${name}`,
    text:
      current === 0
        ? `No page views in the last hour (usually about ${Math.round(baseline)}). Is tracking still on the site?`
        : `${current} page views in the last hour, usually about ${Math.round(baseline)}.`,
    url: appUrl(`/websites/${rule.websiteId}`),
    data: { websiteId: rule.websiteId, current, baseline: Math.round(baseline) },
  });
}

/** Runs the scheduled checks (spikes and traffic drops) for every enabled rule. */
export async function runScheduledAlerts(now = new Date()) {
  const rules = await prisma.client.alertRule.findMany({
    where: { enabled: true, type: { in: ['error.spike', 'traffic.drop'] } },
  });

  for (const rule of rules) {
    if (!rule.channelIds.length) continue;

    try {
      if (rule.type === 'error.spike') await checkSpike(rule, now);
      else await checkTrafficDrop(rule, now);
    } catch (e) {
      console.error(`Alert check failed (${rule.type}, ${rule.websiteId}):`, e);
    }
  }
}

let started = false;

export function startAlertSchedule() {
  if (started) return;
  started = true;

  setInterval(() => void runScheduledAlerts(), INTERVAL_MS).unref?.();
}
