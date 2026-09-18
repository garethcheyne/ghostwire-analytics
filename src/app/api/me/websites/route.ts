import { z } from 'zod';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { pagingParams, sortingParams } from '@/lib/schema';
import { getAllUserWebsitesIncludingTeamAccess, getUserWebsites } from '@/queries/prisma';

export async function GET(request: Request) {
  const schema = z.object({
    ...pagingParams,
    ...sortingParams,
    includeTeams: z.string().optional(),
  });

  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  // Share links authenticate without a user; these routes are about the signed-in user.
  if (!auth.user) {
    return unauthorized();
  }

  const filters = await getQueryFilters(query);

  if (query.includeTeams) {
    return json(await getAllUserWebsitesIncludingTeamAccess(auth.user.id, filters));
  }

  return json(await getUserWebsites(auth.user.id, filters));
}
