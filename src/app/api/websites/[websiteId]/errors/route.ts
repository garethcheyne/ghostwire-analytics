import { z } from 'zod';
import { ERROR_STATUSES } from '@/lib/errors';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { pagingParams, withDateRange } from '@/lib/schema';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getErrorGroups } from '@/queries/sql/errors/getErrors';

/** Error groups with occurrences in the date range. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({
    ...pagingParams,
    status: z.enum(ERROR_STATUSES).optional(),
    search: z.string().trim().max(200).optional(),
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query, websiteId);

  return json(
    await getErrorGroups(websiteId, { ...filters, status: query.status, search: query.search }),
  );
}
