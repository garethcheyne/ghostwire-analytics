import { createErrorKey } from '@/lib/error-key';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canUpdateWebsite } from '@/permissions';
import { updateWebsite } from '@/queries/prisma';

/** Creates (or replaces) the website's error ingest key. The key is only returned this once. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const { key, hash, hint } = createErrorKey();

  await updateWebsite(websiteId, { errorKeyHash: hash, errorKeyHint: hint });

  return json({ key, hint });
}

/** Revokes the key; server clients using it are rejected from then on. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  if (!(await canUpdateWebsite(auth, websiteId))) {
    return unauthorized();
  }

  await updateWebsite(websiteId, { errorKeyHash: null, errorKeyHint: null });

  return json({ ok: true });
}
