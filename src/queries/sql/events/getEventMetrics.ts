
import { EVENT_TYPE, SESSION_COLUMNS } from '@/lib/constants';
import prisma from '@/lib/prisma';
import { metricColumn, sqlInteger } from '@/lib/sql-safe';
import type { QueryFilters } from '@/lib/types';

const FUNCTION_NAME = 'getEventMetrics';

export interface EventMetricParameters {
  type: string;
  limit?: string;
  offset?: string;
}

export interface EventMetricData {
  x: string;
  t: string;
  y: number;
}

export async function getEventMetrics(
  ...args: [websiteId: string, parameters: EventMetricParameters, filters: QueryFilters]
): Promise<EventMetricData[]> {
  return relationalQuery(...args);
}

async function relationalQuery(
  websiteId: string,
  parameters: EventMetricParameters,
  filters: QueryFilters,
) {
  const { type } = parameters;
  const limit = sqlInteger(parameters.limit, 500);
  const offset = sqlInteger(parameters.offset, 0);
  const column = metricColumn(type);
  const { rawQuery, parseFilters } = prisma;
  const { filterQuery, cohortQuery, joinSessionQuery, queryParams } = parseFilters(
    {
      ...filters,
      websiteId,
      eventType: EVENT_TYPE.customEvent,
    },
    { joinSession: SESSION_COLUMNS.includes(type) },
  );

  return rawQuery(
    `
    select ${column} x,
      count(*) as y
    from website_event
    ${cohortQuery}
    ${joinSessionQuery}
    where website_event.website_id = {{websiteId::uuid}}
      and website_event.created_at between {{startDate}} and {{endDate}}
      ${filterQuery}
    group by 1
    order by 2 desc
    limit ${limit}
    offset ${offset}
    `,
    { ...queryParams, ...parameters },
    FUNCTION_NAME,
  );
}
