import { z } from 'zod';
import { ERROR_STATUSES } from '@/lib/errors';
import { prisma } from '@/lib/prisma';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { withDateRange } from '@/lib/schema';
import { canUpdateWebsite, canViewAuthenticatedWebsite } from '@/permissions';
import { getErrorGroup } from '@/queries/sql/errors/getErrors';

/** One error group with breakdowns and recent occurrences in the date range. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; groupId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, withDateRange({}));

  if (error) {
    return error();
  }

  const { websiteId, groupId } = await params;

  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const group = await getErrorGroup(websiteId, groupId, await getQueryFilters(query, websiteId));

  return group ? json(group) : notFound();
}

/** Resolve, ignore or reopen a group. A resolved group reopens itself if it happens again. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; groupId: string }> },
) {
  const { auth, body, error } = await parseRequest(
    request,
    z.object({ status: z.enum(ERROR_STATUSES) }),
  );

  if (error) {
    return error();
  }

  const { websiteId, groupId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const { count } = await prisma.errorGroup.updateMany({
    where: { id: groupId, websiteId },
    data: {
      status: body.status,
      resolvedAt: body.status === 'resolved' ? new Date() : null,
      ...(body.status !== 'open' && { regressedAt: null }),
    },
  });

  return count ? json({ ok: true, status: body.status }) : notFound();
}
