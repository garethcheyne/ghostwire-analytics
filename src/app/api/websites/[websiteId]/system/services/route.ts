import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getSystemServices } from '@/queries/sql/system';

/** Every service reporting to the website, with up/down status. */
export async function GET(request: Request, { params }: { params: Promise<{ websiteId: string }> }) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId } = await params;
  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) return unauthorized();

  return json(await getSystemServices(websiteId));
}
