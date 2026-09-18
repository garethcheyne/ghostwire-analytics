import { getVapidKeys } from '@/lib/push';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';

/** The key browsers subscribe with, and your devices that have notifications on. */
export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  if (!auth.user) return unauthorized();

  const [{ publicKey }, devices] = await Promise.all([
    getVapidKeys(),
    prisma.client.pushSubscription.findMany({
      where: { userId: auth.user.id },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return json({ publicKey, devices });
}
