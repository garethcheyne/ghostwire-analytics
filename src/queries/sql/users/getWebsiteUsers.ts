import { EVENT_TYPE } from '@/lib/constants';
import prisma from '@/lib/prisma';
import type { PageResult } from '@/lib/types';

const FUNCTION_NAME = 'getWebsiteUsers';

/** A visitor the site identified with ghostwire.identify() (or data-distinct-id). */
export interface WebsiteUser {
  id: string;
  sessions: number;
  visits: number;
  firstSeen: string | null;
  lastSeen: string | null;
  /** Latest `email` / `name` passed to identify, if any. */
  email: string | null;
  name: string | null;
}

/**
 * Identified users, most recently seen first. Search matches the user ID or any text value they
 * were identified with (email, name, account...), so support can paste what's on a ticket.
 */
export async function getWebsiteUsers(
  websiteId: string,
  { search, page, pageSize }: { search?: string; page?: number; pageSize?: number },
): Promise<PageResult<WebsiteUser[]>> {
  const { pagedRawQuery } = prisma;

  const searchQuery = search
    ? `and (u.distinct_id ilike {{search}}
        or exists (
          select 1 from session_data sd
          where sd.website_id = u.website_id
            and sd.session_id = u.session_id
            and sd.string_value ilike {{search}}))`
    : '';

  // Latest value of an identify field across all the user's sessions.
  const latest = (key: string) => `(
      select sd.string_value
      from session_data sd
      join session_link l on l.website_id = sd.website_id and l.session_id = sd.session_id
      where l.website_id = {{websiteId::uuid}}
        and l.distinct_id = u.distinct_id
        and sd.data_key = '${key}'
      order by sd.created_at desc
      limit 1)`;

  return pagedRawQuery(
    `
    select
      u.distinct_id as "id",
      count(distinct u.session_id)::int as "sessions",
      count(distinct we.visit_id)::int as "visits",
      min(we.created_at) as "firstSeen",
      max(we.created_at) as "lastSeen",
      ${latest('email')} as "email",
      ${latest('name')} as "name"
    from session_link u
    left join website_event we
      on we.website_id = u.website_id
      and we.session_id = u.session_id
      and we.event_type != ${EVENT_TYPE.performance}
    where u.website_id = {{websiteId::uuid}}
    ${searchQuery}
    group by u.website_id, u.distinct_id
    `,
    { websiteId, search: search ? `%${search}%` : undefined },
    { page, pageSize },
    FUNCTION_NAME,
    'max(we.created_at) desc nulls last, u.distinct_id',
  );
}
