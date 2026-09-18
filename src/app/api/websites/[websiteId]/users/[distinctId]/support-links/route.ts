import { z } from 'zod';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { createSupportSlug, SUPPORT_LINK_MAX_DAYS } from '@/lib/support-links';
import { canUpdateWebsite, canViewAuthenticatedWebsite } from '@/permissions';
import { getWebsiteUser } from '@/queries/sql/users/getWebsiteUser';

type Params = { params: Promise<{ websiteId: string; distinctId: string }> };

/** Active support links for this user. */
export async function GET(request: Request, { params }: Params) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId, distinctId } = await params;

  if (!auth.user || !(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const links = await prisma.client.supportLink.findMany({
    where: { websiteId, distinctId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  return json(links);
}

const schema = z.object({
  days: z.number().int().min(1).max(SUPPORT_LINK_MAX_DAYS).default(7),
  includeReplays: z.boolean().default(false),
  note: z.string().trim().max(200).optional(),
});

/** Creates a link to this user's timeline that expires after `days`. */
export async function POST(request: Request, { params }: Params) {
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();

  const { websiteId, distinctId } = await params;

  if (!auth.user || !(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  if (!(await getWebsiteUser(websiteId, distinctId))) {
    return notFound();
  }

  const link = await prisma.client.supportLink.create({
    data: {
      id: uuid(),
      websiteId,
      distinctId,
      slug: createSupportSlug(),
      includeReplays: body.includeReplays,
      note: body.note || null,
      createdBy: auth.user.id,
      expiresAt: new Date(Date.now() + body.days * 24 * 60 * 60 * 1000),
    },
  });

  return json(link);
}
