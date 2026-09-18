import prisma from '@/lib/prisma';
import { json, notFound } from '@/lib/response';
import { getActiveSupportLink } from '@/lib/support-links';
import { getWebsiteUser } from '@/queries/sql/users/getWebsiteUser';

/** Public: the user timeline behind a support link (no sign-in; the link is the key). */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await getActiveSupportLink(slug);
  if (!link) return notFound();

  const [website, user] = await Promise.all([
    prisma.client.website.findUnique({
      where: { id: link.websiteId },
      select: { name: true, domain: true, deletedAt: true },
    }),
    getWebsiteUser(link.websiteId, link.distinctId),
  ]);

  if (!website || website.deletedAt || !user) return notFound();

  return json({
    website: { name: website.name, domain: website.domain },
    link: { expiresAt: link.expiresAt, includeReplays: link.includeReplays, note: link.note },
    user: link.includeReplays ? user : { ...user, replays: [] },
  });
}
