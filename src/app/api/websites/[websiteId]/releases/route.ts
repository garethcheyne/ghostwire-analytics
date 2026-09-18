import { z } from 'zod';
import { normalizeRelease, registerDeploy } from '@/lib/releases';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { authorizeWebsiteWrite } from '@/lib/website-key';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getReleases } from '@/queries/sql/releases/getReleases';

type Params = { params: Promise<{ websiteId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();

  const { websiteId } = await params;

  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  return json(await getReleases(websiteId));
}

const deploySchema = z.object({
  version: z.string().trim().min(1).max(100),
  environment: z.string().trim().max(50).optional(),
  commit: z.string().trim().max(100).optional(),
  url: z.string().trim().url().max(500).optional(),
  /** Epoch milliseconds or ISO date; defaults to now. */
  deployedAt: z.union([z.number().int().positive(), z.iso.datetime()]).optional(),
});

/** Registers a deploy (from CI with the server key, or signed in). */
export async function POST(request: Request, { params }: Params) {
  const { websiteId } = await params;

  if (!(await authorizeWebsiteWrite(request, websiteId))) {
    return unauthorized();
  }

  const result = deploySchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return badRequest(z.treeifyError(result.error));

  const { version, deployedAt, ...rest } = result.data;
  const release = await registerDeploy(websiteId, {
    ...rest,
    version: normalizeRelease(version)!,
    deployedAt: deployedAt ? new Date(deployedAt) : undefined,
  });

  return json(release);
}
