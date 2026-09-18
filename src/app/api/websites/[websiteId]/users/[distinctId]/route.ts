import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getWebsiteUser } from '@/queries/sql/users/getWebsiteUser';

/** One identified user's sessions, identify fields, activity and replays. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; distinctId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId, distinctId } = await params;

  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const user = await getWebsiteUser(websiteId, distinctId);

  if (!user) {
    return notFound();
  }

  return json(user);
}
