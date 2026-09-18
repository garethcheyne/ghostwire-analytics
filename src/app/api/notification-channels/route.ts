import { audit } from '@/lib/audit';
import { z } from 'zod';
import { channelSchema, serializeChannel } from '@/lib/channels';
import { uuid } from '@/lib/crypto';
import { isEmailConfigured } from '@/lib/notify';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { canUpdateTeam, canViewTeam } from '@/permissions';

/** Your channels, or a team's (?teamId=). */
export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(
    request,
    z.object({ teamId: z.uuid().optional() }),
  );

  if (error) return error();
  if (!auth.user) return unauthorized();

  if (query.teamId && !(await canViewTeam(auth, query.teamId))) {
    return unauthorized();
  }

  const channels = await prisma.client.notificationChannel.findMany({
    where: query.teamId ? { teamId: query.teamId } : { userId: auth.user.id },
    orderBy: { createdAt: 'asc' },
  });

  return json({ data: channels.map(serializeChannel), emailConfigured: isEmailConfigured() });
}

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(
    request,
    z.intersection(channelSchema, z.object({ teamId: z.uuid().optional() })),
  );

  if (error) return error();
  if (!auth.user) return unauthorized();

  const { teamId, ...channel } = body;

  if (teamId && !(await canUpdateTeam(auth, teamId))) {
    return unauthorized();
  }

  if (channel.type === 'telegram' && !channel.config.secret) {
    return badRequest({ message: 'Add the bot token from @BotFather.' });
  }

  if (channel.type === 'email' && !isEmailConfigured()) {
    return badRequest({ message: 'Email is not set up on this server (SMTP_URL and SMTP_FROM).' });
  }

  const created = await prisma.client.notificationChannel.create({
    data: {
      id: uuid(),
      ...(teamId ? { teamId } : { userId: auth.user.id }),
      name: channel.name,
      type: channel.type,
      config: channel.config,
    },
  });

  await audit(request, auth, {
    action: 'channel.create',
    targetType: 'channel',
    targetId: created.id,
    teamId: teamId ?? null,
    details: { name: created.name, type: created.type },
  });
  return json(serializeChannel(created));
}
