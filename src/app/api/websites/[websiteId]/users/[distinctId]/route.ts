import { audit } from '@/lib/audit';
import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { canDeleteWebsite, canViewAuthenticatedWebsite } from '@/permissions';
import { forgetUser } from '@/queries/prisma';
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

/**
 * Forgets the user: erases their sessions, events, replays, heatmap clicks, errors and support
 * links on this website (for data-protection requests). Needs permission to delete the website.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; distinctId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId, distinctId } = await params;

  if (!auth.user || !(await canDeleteWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const result = await forgetUser(websiteId, distinctId);

  await audit(request, auth, {
    action: 'user.forget',
    targetType: 'user',
    targetId: distinctId,
    websiteId,
    details: result,
  });

  return json(result);
}
