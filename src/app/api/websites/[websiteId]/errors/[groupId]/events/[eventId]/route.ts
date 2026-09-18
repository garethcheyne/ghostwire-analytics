import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getErrorEvent } from '@/queries/sql/errors/getErrors';

/** One occurrence: stack trace, frames and context (breadcrumbs, request, user). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; groupId: string; eventId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId, eventId } = await params;

  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const event = await getErrorEvent(websiteId, eventId);

  return event ? json(event) : notFound();
}
