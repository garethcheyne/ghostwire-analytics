import { parseRequest } from '@/lib/request';
import { badRequest, json, notFound, unauthorized } from '@/lib/response';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getTrace } from '@/queries/sql/system';

/** Every span of one trace, for the waterfall. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; traceId: string }> },
) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId, traceId } = await params;
  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) return unauthorized();
  if (!/^[0-9a-f]{32}$/.test(traceId)) return badRequest({ message: 'Not a trace ID.' });

  const spans = await getTrace(websiteId, traceId);
  return spans.length ? json({ traceId, spans }) : notFound();
}
