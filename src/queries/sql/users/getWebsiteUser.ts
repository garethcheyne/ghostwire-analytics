import { EVENT_TYPE } from '@/lib/constants';
import prisma from '@/lib/prisma';

const FUNCTION_NAME = 'getWebsiteUser';

// Caps for one user's page; support rarely needs more than the most recent history.
const SESSION_LIMIT = 100;
const ACTIVITY_LIMIT = 500;
const REPLAY_LIMIT = 100;

export interface WebsiteUserDetail {
  id: string;
  sessions: {
    id: string;
    browser: string | null;
    os: string | null;
    device: string | null;
    country: string | null;
    city: string | null;
    firstAt: string;
    lastAt: string;
    visits: number;
    views: number;
    events: number;
  }[];
  /** Latest value of each field passed to identify, across all sessions. */
  properties: {
    dataKey: string;
    stringValue: string | null;
    numberValue: number | null;
    dateValue: string | null;
    dataType: number;
    createdAt: string;
  }[];
  /** Page views and events, newest first. */
  activity: {
    eventId: string;
    sessionId: string;
    visitId: string;
    createdAt: string;
    urlPath: string;
    eventType: number;
    eventName: string | null;
    referrerDomain: string | null;
    hostname: string | null;
  }[];
  replays: {
    id: string;
    sessionId: string;
    startedAt: string;
    endedAt: string;
    duration: number;
    eventCount: number;
  }[];
}

/** Everything one identified user did, across every session linked to their user ID. */
export async function getWebsiteUser(
  websiteId: string,
  distinctId: string,
): Promise<WebsiteUserDetail | null> {
  const { rawQuery } = prisma;
  const params = { websiteId, distinctId };
  const linked = `
    select session_id from session_link
    where website_id = {{websiteId::uuid}} and distinct_id = {{distinctId}}`;

  const [sessions, properties, activity, replays] = await Promise.all([
    rawQuery(
      `
      select
        session.session_id as "id",
        session.browser,
        session.os,
        session.device,
        session.country,
        session.city,
        min(we.created_at) as "firstAt",
        max(we.created_at) as "lastAt",
        count(distinct we.visit_id)::int as "visits",
        sum(case when we.event_type = ${EVENT_TYPE.pageView} then 1 else 0 end)::int as "views",
        sum(case when we.event_type = ${EVENT_TYPE.customEvent} then 1 else 0 end)::int as "events"
      from session
      join website_event we
        on we.website_id = session.website_id
        and we.session_id = session.session_id
        and we.event_type != ${EVENT_TYPE.performance}
      where session.website_id = {{websiteId::uuid}}
        and session.session_id in (${linked})
      group by session.session_id
      order by max(we.created_at) desc
      limit ${SESSION_LIMIT}
      `,
      params,
      FUNCTION_NAME,
    ),
    rawQuery(
      `
      select distinct on (data_key)
        data_key as "dataKey",
        string_value as "stringValue",
        number_value as "numberValue",
        date_value as "dateValue",
        data_type as "dataType",
        created_at as "createdAt"
      from session_data
      where website_id = {{websiteId::uuid}}
        and session_id in (${linked})
      order by data_key, created_at desc
      `,
      params,
      FUNCTION_NAME,
    ),
    rawQuery(
      `
      select
        event_id as "eventId",
        session_id as "sessionId",
        visit_id as "visitId",
        created_at as "createdAt",
        url_path as "urlPath",
        event_type as "eventType",
        event_name as "eventName",
        referrer_domain as "referrerDomain",
        hostname
      from website_event
      where website_id = {{websiteId::uuid}}
        and session_id in (${linked})
        and event_type in (${EVENT_TYPE.pageView}, ${EVENT_TYPE.customEvent})
      order by created_at desc
      limit ${ACTIVITY_LIMIT}
      `,
      params,
      FUNCTION_NAME,
    ),
    rawQuery(
      `
      select
        visit_id as "id",
        session_id as "sessionId",
        min(started_at) as "startedAt",
        max(ended_at) as "endedAt",
        (extract(epoch from max(ended_at) - min(started_at)) * 1000)::bigint as "duration",
        sum(event_count)::int as "eventCount"
      from session_replay
      where website_id = {{websiteId::uuid}}
        and session_id in (${linked})
      group by visit_id, session_id
      order by min(started_at) desc
      limit ${REPLAY_LIMIT}
      `,
      params,
      FUNCTION_NAME,
    ),
  ]);

  if (!sessions.length && !properties.length) {
    return null;
  }

  return {
    id: distinctId,
    sessions,
    properties: properties.map((property: any) => ({
      ...property,
      numberValue: property.numberValue === null ? null : Number(property.numberValue),
    })),
    activity,
    replays: replays.map((replay: any) => ({ ...replay, duration: Number(replay.duration) })),
  };
}
