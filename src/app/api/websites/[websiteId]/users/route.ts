import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { pagingParams } from '@/lib/schema';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getWebsiteUsers } from '@/queries/sql/users/getWebsiteUsers';

/** Identified users, searchable by user ID or any identify value (e.g. email from a ticket). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = z.object({
    ...pagingParams,
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

  return json(await getWebsiteUsers(websiteId, query));
}
