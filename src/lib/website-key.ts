/*
 * Endpoints used from CI and servers (deploys, source maps) accept either the website's server
 * key (Authorization: Bearer gwe_…, the same key as error reporting) or a signed-in user who can
 * edit the website.
 */
import { verifyErrorKey } from '@/lib/error-key';
import { prisma } from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { canUpdateWebsite } from '@/permissions';

export async function authorizeWebsiteWrite(request: Request, websiteId: string) {
  const header = request.headers.get('authorization') ?? '';
  const key = header.replace(/^Bearer\s+/i, '');

  if (key.startsWith('gwe_')) {
    const website = await prisma.website.findUnique({
      where: { id: websiteId },
      select: { errorKeyHash: true, deletedAt: true },
    });
    return !!website && !website.deletedAt && verifyErrorKey(key, website.errorKeyHash);
  }

  const { auth, error } = await parseRequest(request.clone());
  return !error && !!auth?.user && !!(await canUpdateWebsite(auth, websiteId));
}
