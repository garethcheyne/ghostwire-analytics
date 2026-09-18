import { audit } from '@/lib/audit';
import {
  canManageChannel,
  channelSchema,
  SECRET_CHANNEL_TYPES,
  serializeChannel,
} from '@/lib/channels';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, notFound, ok, unauthorized } from '@/lib/response';

type Params = { params: Promise<{ channelId: string }> };

async function load(request: Request, { params }: Params, schema?: any) {
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return { response: error() };

  const { channelId } = await params;
  const channel = await prisma.client.notificationChannel.findUnique({ where: { id: channelId } });

  if (!channel) return { response: notFound() };
  if (!(await canManageChannel(auth, channel))) return { response: unauthorized() };

  return { channel, body, auth };
}

export async function POST(request: Request, context: Params) {
  const result = await load(request, context, channelSchema);
  if ('response' in result) return result.response;
  const { channel, body, auth } = result;

  // Keep the existing webhook secret or bot token unless a new one is given.
  const previous = (channel.config ?? {}) as Record<string, unknown>;
  const config =
    SECRET_CHANNEL_TYPES.includes(body.type) && !(body.config as any).secret && previous.secret
      ? { ...body.config, secret: previous.secret }
      : body.config;

  const updated = await prisma.client.notificationChannel.update({
    where: { id: channel.id },
    data: { name: body.name, type: body.type, config },
  });

  await audit(request, auth, {
    action: 'channel.update',
    targetType: 'channel',
    targetId: channel.id,
    teamId: channel.teamId,
    details: { name: updated.name, type: updated.type },
  });
  return json(serializeChannel(updated));
}

export async function DELETE(request: Request, context: Params) {
  const result = await load(request, context);
  if ('response' in result) return result.response;
  const { channel, auth } = result;

  await prisma.client.notificationChannel.delete({ where: { id: channel.id } });
  await audit(request, auth, {
    action: 'channel.delete',
    targetType: 'channel',
    targetId: channel.id,
    teamId: channel.teamId,
    details: { name: channel.name },
  });

  return ok();
}
