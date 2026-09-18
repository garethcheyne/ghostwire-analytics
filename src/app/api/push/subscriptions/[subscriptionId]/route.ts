import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';

/** Turns notifications off for one of your devices. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ subscriptionId: string }> },
) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  if (!auth.user) return unauthorized();

  const { subscriptionId } = await params;
  await prisma.client.pushSubscription.deleteMany({
    where: { id: subscriptionId, userId: auth.user.id },
  });

  return json({ ok: true });
}
