import prisma from '@/lib/prisma';

const FUNCTION_NAME = 'getReleases';

export interface ReleaseSummary {
  version: string;
  environment: string | null;
  commit: string | null;
  url: string | null;
  deployedAt: string | null;
  firstSeen: string;
  lastSeen: string;
  /** Sessions with at least one event from this release. */
  sessions: number;
  /** Of those, sessions that had an error. */
  errorSessions: number;
  errors: number;
  /** Errors first seen in this release. */
  newErrors: number;
  /** Resolved errors that came back in this release. */
  regressions: number;
}

/** The latest 50 releases (by deploy, else first seen) with their health numbers. */
export async function getReleases(websiteId: string): Promise<ReleaseSummary[]> {
  return prisma.rawQuery(
    `
    select
      r.version,
      r.environment,
      r.commit,
      r.url,
      r.deployed_at as "deployedAt",
      r.first_seen as "firstSeen",
      r.last_seen as "lastSeen",
      (select count(distinct we.session_id) from website_event we
        where we.website_id = r.website_id and we.release = r.version)::int as "sessions",
      (select count(distinct ee.session_id) from error_event ee
        where ee.website_id = r.website_id and ee.release = r.version
          and ee.session_id is not null)::int as "errorSessions",
      (select count(*) from error_event ee
        where ee.website_id = r.website_id and ee.release = r.version)::int as "errors",
      (select count(*) from error_group g
        where g.website_id = r.website_id and g.first_release = r.version)::int as "newErrors",
      (select count(*) from error_group g
        where g.website_id = r.website_id and g.regressed_release = r.version)::int as "regressions"
    from release r
    where r.website_id = {{websiteId::uuid}}
    order by coalesce(r.deployed_at, r.first_seen) desc
    limit 50
    `,
    { websiteId },
    FUNCTION_NAME,
  );
}
