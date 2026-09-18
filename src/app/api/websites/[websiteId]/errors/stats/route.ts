import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { withDateRange } from '@/lib/schema';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getErrorStats } from '@/queries/sql/errors/getErrors';

/** Error totals and a time series for the date range. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, query, error } = await parseRequest(request, withDateRange({}));

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  return json(await getErrorStats(websiteId, await getQueryFilters(query, websiteId)));
}
