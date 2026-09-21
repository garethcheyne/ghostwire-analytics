import prisma from '@/lib/prisma';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getVisitorTypeStats';

export interface VisitorTypeStats {
  /** Visitors whose first visit to the site falls inside the period. */
  newVisitors: number;
  /** Visitors first seen before the period who came back during it. */
  returningVisitors: number;
}

/**
 * Splits the period's visitors into first-timers and people coming back.
 *
 * A session row is created the first time a visitor is seen and reused on
 * every later visit, so `session.created_at` is that visitor's first-ever
 * visit — anyone active in the period whose row predates it is returning.
 *
 * This is bounded by how long a visitor stays recognisable: the session hash
 * is built from the browser, device and network, so someone who clears their
 * cookies, switches device or changes network counts as new again. The split
 * is a reasonable read of loyalty, not an identity count.
 */
export async function getVisitorTypeStats(
  ...args: [websiteId: string, filters: QueryFilters]
): Promise<VisitorTypeStats> {
  return relationalQuery(...args);
}

async function relationalQuery(
  websiteId: string,
  filters: QueryFilters,
): Promise<VisitorTypeStats> {
  const { parseFilters, rawQuery } = prisma;
  // joinSession forces the session join on: it is otherwise added only when a
  // session filter is present, and joining the table again here would be a
  // duplicate alias the moment anyone filtered by country or browser.
  const { filterQuery, cohortQuery, excludeBounceQuery, joinSessionQuery, queryParams } =
    parseFilters(
      {
        ...filters,
        websiteId,
      },
      { joinSession: true },
    );

  const rows = await rawQuery(
    `
    select
      count(distinct case when session.created_at >= {{startDate}} then website_event.session_id end) as "newVisitors",
      count(distinct case when session.created_at < {{startDate}} then website_event.session_id end) as "returningVisitors"
    from website_event
    ${cohortQuery}
    ${excludeBounceQuery}
    ${joinSessionQuery}
    where website_event.website_id = {{websiteId::uuid}}
      and website_event.created_at between {{startDate}} and {{endDate}}
      and website_event.event_type NOT IN (2, 5)
      ${filterQuery}
    `,
    queryParams,
    FUNCTION_NAME,
  );

  const row = (rows as any[])?.[0];

  return {
    newVisitors: Number(row?.newVisitors ?? 0),
    returningVisitors: Number(row?.returningVisitors ?? 0),
  };
}
