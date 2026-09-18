/*
 * Releases: the versions a site reports (data-release on the tracker, `release` from the client
 * libraries) and deploys registered through the API.
 */
import { log } from '@/lib/logger';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';

/** Recording a release is throttled per website+version, so page views don't write every time. */
const RECORD_EVERY_MS = 10 * 60 * 1000;
const MAX_CACHE = 5000;
const recent = new Map<string, number>();

export function normalizeRelease(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().slice(0, 100);
  return trimmed || null;
}

/** Notes that a release was seen at `at`. Never throws. */
export async function recordRelease(
  websiteId: string,
  version: string | null | undefined,
  at = new Date(),
  environment?: string | null,
) {
  if (!version) return;

  const key = `${websiteId}:${version}`;
  const last = recent.get(key);
  if (last && at.getTime() - last < RECORD_EVERY_MS) return;

  if (recent.size >= MAX_CACHE) recent.clear();
  recent.set(key, at.getTime());

  try {
    await prisma.client.$executeRaw`
      insert into release (release_id, website_id, version, environment, first_seen, last_seen, created_at)
      values (${uuid()}::uuid, ${websiteId}::uuid, ${version}, ${environment ?? null}, ${at}, ${at}, now())
      on conflict (website_id, version) do update set
        first_seen = least(release.first_seen, excluded.first_seen),
        last_seen = greatest(release.last_seen, excluded.last_seen),
        environment = coalesce(release.environment, excluded.environment)`;
  } catch (e) {
    recent.delete(key);
    log.error('release.record_failed', { websiteId, version, error: e });
  }
}

export interface DeployInput {
  version: string;
  environment?: string | null;
  commit?: string | null;
  url?: string | null;
  deployedAt?: Date;
}

/** Registers (or updates) a deploy; it shows on charts from `deployedAt`. */
export async function registerDeploy(websiteId: string, input: DeployInput) {
  const at = input.deployedAt ?? new Date();

  await prisma.client.$executeRaw`
    insert into release (
      release_id, website_id, version, environment, commit, url, deployed_at, first_seen, last_seen, created_at
    )
    values (
      ${uuid()}::uuid, ${websiteId}::uuid, ${input.version}, ${input.environment ?? null},
      ${input.commit ?? null}, ${input.url ?? null}, ${at}, ${at}, ${at}, now()
    )
    on conflict (website_id, version) do update set
      deployed_at = excluded.deployed_at,
      environment = coalesce(excluded.environment, release.environment),
      commit = coalesce(excluded.commit, release.commit),
      url = coalesce(excluded.url, release.url),
      first_seen = least(release.first_seen, excluded.first_seen)`;

  return prisma.client.release.findUnique({
    where: { websiteId_version: { websiteId, version: input.version } },
  });
}

/** For tests. */
export function resetReleaseCache() {
  recent.clear();
}
