import type { ErrorStatus } from '@/lib/errors';
import prisma from '@/lib/prisma';
import type { PageResult, QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getErrors';

// Affected users: identified user where known, otherwise the anonymous session.
const USER_KEY = 'coalesce(e.distinct_id, e.session_id::text)';

export interface ErrorGroupSummary {
  id: string;
  type: string;
  message: string;
  culprit: string | null;
  source: 'browser' | 'server';
  platform: string;
  status: ErrorStatus;
  firstSeen: string;
  lastSeen: string;
  regressedAt: string | null;
  firstRelease: string | null;
  lastRelease: string | null;
  /** All-time occurrences. */
  total: number;
  /** Occurrences and affected users in the date range. */
  events: number;
  users: number;
}

/** Error groups with occurrences in the date range, most recently seen first. */
export async function getErrorGroups(
  websiteId: string,
  filters: QueryFilters & {
    status?: ErrorStatus;
    search?: string;
    /** Only occurrences in this release. */
    release?: string;
    /** Only errors that first appeared in `release`. */
    newInRelease?: boolean;
  },
): Promise<PageResult<ErrorGroupSummary[]>> {
  const { pagedRawQuery } = prisma;
  const { startDate, endDate, status = 'open', search, release, newInRelease } = filters;

  return pagedRawQuery(
    `
    select
      g.error_group_id as "id",
      g.type,
      g.message,
      g.culprit,
      g.source,
      g.platform,
      g.status,
      g.first_seen as "firstSeen",
      g.last_seen as "lastSeen",
      g.regressed_at as "regressedAt",
      g.first_release as "firstRelease",
      g.last_release as "lastRelease",
      g.count as "total",
      count(*)::int as "events",
      count(distinct ${USER_KEY})::int as "users"
    from error_group g
    join error_event e
      on e.error_group_id = g.error_group_id
      and e.created_at between {{startDate}} and {{endDate}}
      ${release && !newInRelease ? 'and e.release = {{release}}' : ''}
    where g.website_id = {{websiteId::uuid}}
      and g.status = {{status}}
      ${release && newInRelease ? 'and g.first_release = {{release}}' : ''}
      ${search ? 'and (g.message ilike {{search}} or g.type ilike {{search}} or g.culprit ilike {{search}})' : ''}
    group by g.error_group_id
    `,
    {
      websiteId,
      startDate,
      endDate,
      status,
      release,
      search: search ? `%${search}%` : undefined,
    },
    filters,
    FUNCTION_NAME,
    'max(e.created_at) desc',
  );
}

/** Totals and a time series for the Errors page. */
export async function getErrorStats(websiteId: string, filters: QueryFilters) {
  const { rawQuery, getDateSQL } = prisma;
  const { startDate, endDate, unit = 'day', timezone = 'utc' } = filters;
  const params = { websiteId, startDate, endDate };

  const [[totals], series] = await Promise.all([
    rawQuery(
      `
      select
        count(*)::int as "events",
        count(distinct ${USER_KEY})::int as "users",
        count(distinct e.error_group_id)::int as "groups",
        count(distinct e.error_group_id) filter (
          where g.first_seen between {{startDate}} and {{endDate}}
        )::int as "newGroups"
      from error_event e
      join error_group g on g.error_group_id = e.error_group_id
      where e.website_id = {{websiteId::uuid}}
        and e.created_at between {{startDate}} and {{endDate}}
      `,
      params,
      FUNCTION_NAME,
    ),
    rawQuery(
      `
      select ${getDateSQL('e.created_at', unit, timezone)} as x, count(*)::int as y
      from error_event e
      where e.website_id = {{websiteId::uuid}}
        and e.created_at between {{startDate}} and {{endDate}}
      group by 1
      order by 1
      `,
      params,
      FUNCTION_NAME,
    ),
  ]);

  return { ...totals, series };
}

export interface ErrorOccurrence {
  id: string;
  createdAt: string;
  distinctId: string | null;
  sessionId: string | null;
  visitId: string | null;
  urlPath: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  release: string | null;
  environment: string | null;
  /** The visit was recorded, so there's a replay to watch. */
  hasReplay: boolean;
}

export interface ErrorEventDetail extends ErrorOccurrence {
  type: string;
  message: string;
  stack: string | null;
  frames:
    | {
        file: string;
        function: string | null;
        line: number | null;
        column: number | null;
        inApp: boolean;
      }[]
    | null;
  hostname: string | null;
  context: Record<string, any> | null;
}

const OCCURRENCE_COLUMNS = `
  e.error_event_id as "id",
  e.created_at as "createdAt",
  e.distinct_id as "distinctId",
  e.session_id as "sessionId",
  e.visit_id as "visitId",
  e.url_path as "urlPath",
  e.browser,
  e.os,
  e.device,
  e.release,
  e.environment,
  exists (
    select 1 from session_replay sr
    where sr.website_id = e.website_id and sr.visit_id = e.visit_id
  ) as "hasReplay"`;

/** One group: its details, breakdowns and recent occurrences in the date range. */
export async function getErrorGroup(websiteId: string, groupId: string, filters: QueryFilters) {
  const { rawQuery, getDateSQL } = prisma;
  const { startDate, endDate, unit = 'day', timezone = 'utc' } = filters;
  const params = { websiteId, groupId, startDate, endDate };
  const inRange = `
    e.website_id = {{websiteId::uuid}}
    and e.error_group_id = {{groupId::uuid}}
    and e.created_at between {{startDate}} and {{endDate}}`;

  const [group] = await rawQuery(
    `
      select
        error_group_id as "id", type, message, culprit, source, platform, status,
        first_seen as "firstSeen", last_seen as "lastSeen", resolved_at as "resolvedAt",
        regressed_at as "regressedAt", count as "total",
        first_release as "firstRelease", last_release as "lastRelease",
        regressed_release as "regressedRelease"
      from error_group
      where website_id = {{websiteId::uuid}} and error_group_id = {{groupId::uuid}}
      `,
    params,
    FUNCTION_NAME,
  );

  if (!group) return null;

  const breakdown = (column: string) =>
    rawQuery(
      `
      select ${column} as x, count(*)::int as y
      from error_event e
      where ${inRange} and ${column} is not null
      group by 1
      order by 2 desc
      limit 5
      `,
      params,
      FUNCTION_NAME,
    );

  const [[totals], series, pages, browsers, releases, environments, occurrences] =
    await Promise.all([
      rawQuery(
        `
        select count(*)::int as "events", count(distinct ${USER_KEY})::int as "users"
        from error_event e
        where ${inRange}
        `,
        params,
        FUNCTION_NAME,
      ),
      rawQuery(
        `
        select ${getDateSQL('e.created_at', unit, timezone)} as x, count(*)::int as y
        from error_event e
        where ${inRange}
        group by 1
        order by 1
        `,
        params,
        FUNCTION_NAME,
      ),
      breakdown('e.url_path'),
      breakdown('e.browser'),
      breakdown('e.release'),
      breakdown('e.environment'),
      rawQuery(
        `
        select ${OCCURRENCE_COLUMNS}
        from error_event e
        where ${inRange}
        order by e.created_at desc
        limit 50
        `,
        params,
        FUNCTION_NAME,
      ),
    ]);

  return {
    ...group,
    ...totals,
    series,
    breakdowns: { pages, browsers, releases, environments },
    occurrences: occurrences as ErrorOccurrence[],
  };
}

/** Full detail of one occurrence: stack, parsed frames and context. */
export async function getErrorEvent(
  websiteId: string,
  eventId: string,
): Promise<ErrorEventDetail | null> {
  const { rawQuery } = prisma;

  const [event] = await rawQuery(
    `
    select ${OCCURRENCE_COLUMNS},
      e.type, e.message, e.stack, e.frames, e.hostname, e.context
    from error_event e
    where e.website_id = {{websiteId::uuid}} and e.error_event_id = {{eventId::uuid}}
    `,
    { websiteId, eventId },
    FUNCTION_NAME,
  );

  return event ?? null;
}

/** Errors for one identified user (and their linked sessions), for the Users page. */
export async function getUserErrors(websiteId: string, distinctId: string) {
  const { rawQuery } = prisma;

  return rawQuery(
    `
    select
      e.error_event_id as "id",
      e.error_group_id as "groupId",
      e.created_at as "createdAt",
      e.session_id as "sessionId",
      e.visit_id as "visitId",
      e.type,
      e.message,
      e.url_path as "urlPath",
      e.source
    from error_event e
    where e.website_id = {{websiteId::uuid}}
      and (
        e.distinct_id = {{distinctId}}
        or e.session_id in (
          select session_id from session_link
          where website_id = {{websiteId::uuid}} and distinct_id = {{distinctId}}
        )
      )
    order by e.created_at desc
    limit 200
    `,
    { websiteId, distinctId },
    FUNCTION_NAME,
  );
}
