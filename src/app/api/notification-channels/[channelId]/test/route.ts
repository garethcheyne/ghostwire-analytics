import { canManageChannel } from '@/lib/channels';
import { appUrl, type Channel, sendNotification } from '@/lib/notify';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';

/** Sends a test message, returning the delivery error if it fails. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ channelId: string }> },
) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { channelId } = await params;
  const channel = await prisma.client.notificationChannel.findUnique({ where: { id: channelId } });

  if (!channel) return notFound();
  if (!(await canManageChannel(auth, channel))) return unauthorized();

  try {
    await sendNotification(channel as unknown as Channel, {
      event: 'test',
      level: 'info',
      title: 'Test alert from Ghostwire Analytics',
      text: `If you can read this, "${channel.name}" is ready for alerts.`,
      url: appUrl('/websites'),
    });
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
