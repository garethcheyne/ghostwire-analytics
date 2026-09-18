import { canManageChannel, channelSchema, serializeChannel } from '@/lib/channels';
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

  return { channel, body };
}

export async function POST(request: Request, context: Params) {
  const result = await load(request, context, channelSchema);
  if ('response' in result) return result.response;
  const { channel, body } = result;

  // Keep the existing webhook secret unless a new one is given.
  const previous = (channel.config ?? {}) as Record<string, unknown>;
  const config =
    body.type === 'webhook' && !body.config.secret && previous.secret
      ? { ...body.config, secret: previous.secret }
      : body.config;

  const updated = await prisma.client.notificationChannel.update({
    where: { id: channel.id },
    data: { name: body.name, type: body.type, config },
  });

  return json(serializeChannel(updated));
}

export async function DELETE(request: Request, context: Params) {
  const result = await load(request, context);
  if ('response' in result) return result.response;
  const { channel } = result;

  await prisma.client.notificationChannel.delete({ where: { id: channel.id } });

  return ok();
}
