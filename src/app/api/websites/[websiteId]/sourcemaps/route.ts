import { normalizeRelease } from '@/lib/releases';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { badRequest, json, ok, payloadTooLarge, unauthorized } from '@/lib/response';
import { MAX_SOURCE_MAP_BYTES, saveSourceMap, toFilePath } from '@/lib/source-maps';
import { authorizeWebsiteWrite } from '@/lib/website-key';
import { canViewAuthenticatedWebsite } from '@/permissions';

type Params = { params: Promise<{ websiteId: string }> };

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Releases that have source maps, with counts. */
export async function GET(request: Request, { params }: Params) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId } = await params;

  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const releases = await prisma.client.sourceMap.groupBy({
    by: ['release'],
    where: { websiteId },
    _count: { _all: true },
    _sum: { size: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: 'desc' } },
    take: 50,
  });

  return json(
    releases.map(row => ({
      release: row.release,
      files: row._count._all,
      size: row._sum.size ?? 0,
      uploadedAt: row._max.createdAt,
    })),
  );
}

/**
 * Uploads source maps for a release (multipart/form-data). Fields: `release`, and one `file` part
 * per map whose filename is the minified file's URL path plus .map, e.g.
 * /_next/static/chunks/main-1a2b.js.map. Uploading again replaces a file's map.
 */
export async function POST(request: Request, { params }: Params) {
  const { websiteId } = await params;

  if (Number(request.headers.get('content-length') ?? 0) > MAX_UPLOAD_BYTES) {
    return payloadTooLarge({ maxBytes: MAX_UPLOAD_BYTES });
  }

  if (!(await authorizeWebsiteWrite(request, websiteId))) {
    return unauthorized();
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest({ message: 'Send multipart/form-data with a release and map files.' });
  }

  const release = normalizeRelease(form.get('release'));
  if (!release) return badRequest({ message: 'The release is required.' });

  const files = form.getAll('file').filter((part): part is File => typeof part !== 'string');
  if (!files.length) return badRequest({ message: 'No map files were sent.' });

  const saved: string[] = [];
  const failed: { file: string; error: string }[] = [];

  for (const file of files) {
    const fileName = toFilePath(file.name.replace(/\.map$/, ''));

    if (!fileName || !file.name.endsWith('.map')) {
      failed.push({ file: file.name, error: 'Name it by URL path, ending in .map.' });
      continue;
    }

    if (file.size > MAX_SOURCE_MAP_BYTES) {
      failed.push({ file: file.name, error: 'Larger than 30 MB.' });
      continue;
    }

    try {
      await saveSourceMap(websiteId, release, fileName, Buffer.from(await file.arrayBuffer()));
      saved.push(fileName);
    } catch (e) {
      failed.push({ file: file.name, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return json({ release, saved: saved.length, failed });
}

/** Deletes a release's source maps (?release=). */
export async function DELETE(request: Request, { params }: Params) {
  const { websiteId } = await params;

  if (!(await authorizeWebsiteWrite(request, websiteId))) {
    return unauthorized();
  }

  const release = normalizeRelease(new URL(request.url).searchParams.get('release'));
  if (!release) return badRequest({ message: 'The release is required.' });

  await prisma.client.sourceMap.deleteMany({ where: { websiteId, release } });

  return ok();
}
