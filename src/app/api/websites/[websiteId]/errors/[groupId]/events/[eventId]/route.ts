import { parseRequest } from '@/lib/request';
import { json, notFound, unauthorized } from '@/lib/response';
import { resolveFrames } from '@/lib/source-maps';
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
  if (!event) return notFound();

  // Errors saved before their source maps were uploaded are mapped when viewed.
  if (event.frames?.length && !event.frames.some(frame => frame.minified)) {
    const { frames, resolved } = await resolveFrames(websiteId, event.release, event.frames);
    if (resolved) return json({ ...event, frames });
  }

  return json(event);
}
