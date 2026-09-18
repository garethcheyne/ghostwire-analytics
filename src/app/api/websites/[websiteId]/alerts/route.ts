import { z } from 'zod';
import { ALERT_DEFAULTS, ALERT_TYPES } from '@/lib/alerts';
import { canUseChannel, serializeChannel } from '@/lib/channels';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, unauthorized } from '@/lib/response';
import { canUpdateWebsite, canViewAuthenticatedWebsite } from '@/permissions';

type Params = { params: Promise<{ websiteId: string }> };

/** The website's alert rules, the channels you can send them to, and recent alerts. */
export async function GET(request: Request, { params }: Params) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId } = await params;

  if (!auth.user || !(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const website = await prisma.client.website.findUnique({
    where: { id: websiteId },
    select: { teamId: true },
  });
  if (!website) return notFound();

  const [rules, channels, log] = await Promise.all([
    prisma.client.alertRule.findMany({ where: { websiteId } }),
    prisma.client.notificationChannel.findMany({
      where: {
        OR: [{ userId: auth.user.id }, ...(website.teamId ? [{ teamId: website.teamId }] : [])],
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.client.alertLog.findMany({
      where: { websiteId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);

  return json({
    rules: ALERT_TYPES.map(type => {
      const rule = rules.find(r => r.type === type);
      return {
        type,
        enabled: rule?.enabled ?? false,
        channelIds: rule?.channelIds ?? [],
        parameters: { ...ALERT_DEFAULTS[type], ...((rule?.parameters as object) ?? {}) },
        lastTriggeredAt: rule?.lastTriggeredAt ?? null,
      };
    }),
    channels: channels.map(serializeChannel),
    log,
  });
}

const schema = z.object({
  type: z.enum(ALERT_TYPES),
  enabled: z.boolean(),
  channelIds: z.array(z.uuid()).max(10),
  parameters: z.record(z.string(), z.number().positive().max(100_000)).optional(),
});

export async function POST(request: Request, { params }: Params) {
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();

  const { websiteId } = await params;

  if (!auth.user || !(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const website = await prisma.client.website.findUnique({
    where: { id: websiteId },
    select: { teamId: true },
  });
  if (!website) return notFound();

  const channels = await prisma.client.notificationChannel.findMany({
    where: { id: { in: body.channelIds } },
  });

  for (const id of body.channelIds) {
    const channel = channels.find(c => c.id === id);
    if (!channel || !(await canUseChannel(auth, channel, website.teamId))) {
      return badRequest({ message: 'One of the channels is not available for this website.' });
    }
  }

  if (body.type === 'traffic.drop' && (body.parameters?.percent ?? 50) >= 100) {
    return badRequest({ message: 'The drop must be less than 100%.' });
  }

  // Only the parameters this alert type uses.
  const parameters = Object.fromEntries(
    Object.keys(ALERT_DEFAULTS[body.type]).flatMap(key =>
      body.parameters?.[key] !== undefined ? [[key, body.parameters[key]]] : [],
    ),
  );

  const rule = await prisma.client.alertRule.upsert({
    where: { websiteId_type: { websiteId, type: body.type } },
    create: {
      id: uuid(),
      websiteId,
      type: body.type,
      enabled: body.enabled,
      channelIds: body.channelIds,
      parameters,
    },
    update: { enabled: body.enabled, channelIds: body.channelIds, parameters },
  });

  return json(rule);
}
