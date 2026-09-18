import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { notFound, ok, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';

/** Revokes a support link straight away. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { linkId } = await params;
  const link = await prisma.client.supportLink.findUnique({ where: { id: linkId } });

  if (!link) return notFound();
  if (!auth.user || !(await canUpdateWebsite(auth, link.websiteId))) return unauthorized();

  await prisma.client.supportLink.delete({ where: { id: link.id } });

  return ok();
}
