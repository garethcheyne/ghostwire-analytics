import { z } from 'zod';
import { checkAuth } from '@/lib/auth';
import { DEFAULT_PAGE_SIZE, FILTER_COLUMNS, OPERATORS } from '@/lib/constants';
import { getAllowedUnits, getMinimumUnit, maxDate, parseDateRange } from '@/lib/date';
import { fetchWebsite } from '@/lib/load';
import {
  filtersArrayToObject,
  parseSessionPropertyFilters,
  parseUniversalEventPropertyFilters,
} from '@/lib/params';
import { badRequest, forbidden, unauthorized } from '@/lib/response';
import type { QueryFilters } from '@/lib/types';
import { getWebsiteSegment } from '@/queries/prisma';

export async function parseRequest(
  request: Request,
  schema?: any,
  options?: { skipAuth: boolean },
): Promise<any> {
  const url = new URL(request.url);
  let query = Object.fromEntries(url.searchParams);
  let body = await getJsonBody(request);
  let error: (() => Response) | undefined;
  let auth: Awaited<ReturnType<typeof checkAuth>> = null;

  if (schema) {
    const isGet = request.method === 'GET';
    const rawQuery = query;
    const result = schema.safeParse(isGet ? query : body);

    if (!result.success) {
      error = () => badRequest(z.treeifyError(result.error));
    } else if (isGet) {
      query = result.data;

      // Re-add dynamic params stripped by Zod schema: suffixed filter params (browser1, os2)
      for (const key of Object.keys(rawQuery)) {
        if (
          (/\d+$/.test(key) || /^pf_/.test(key) || /^epf\d+$/.test(key) || /^spf\d+$/.test(key)) &&
          !(key in query)
        ) {
          query[key] = rawQuery[key];
        }
      }
    } else {
      body = result.data;
    }
  }

  if (!options?.skipAuth && !error) {
    auth = await checkAuth(request);

    if (!auth) {
      error = () => unauthorized();
    } else if (!auth.user && query) {
      // Share links never reveal identified users (their IDs are usernames/emails).
      if (query.type === 'distinctId') {
        error = () => forbidden({ message: 'Not available on shared links.' });
      }

      for (const key of Object.keys(query)) {
        if (/^distinctId\d*$/.test(key)) delete query[key];
      }
    }
  }

  return { url, query, body, auth, error };
}

export async function getJsonBody(request: Request) {
  try {
    return await request.clone().json();
  } catch {
    return undefined;
  }
}

export function getRequestDateRange(query: Record<string, string>) {
  const { startAt, endAt, unit, timezone } = query;

  const startDate = new Date(+startAt);
  const endDate = new Date(+endAt);

  return {
    startDate,
    endDate,
    timezone,
    unit: getAllowedUnits(startDate, endDate).includes(unit)
      ? unit
      : getMinimumUnit(startDate, endDate),
  };
}

export function getRequestFilters(query: Record<string, any>) {
  const result: Record<string, any> = {};

  for (const key of Object.keys(query)) {
    const baseName = key.replace(/\d+$/, '');
    if (baseName in FILTER_COLUMNS) {
      result[key] = query[key];
    }
  }

  return result;
}

export async function setWebsiteDate(websiteId: string, data: Record<string, any>) {
  const website = await fetchWebsite(websiteId);

  if (website?.resetAt) {
    data.startDate = maxDate(data.startDate, new Date(website?.resetAt));
  }

  return data;
}

export async function getQueryFilters(
  params: Record<string, any>,
  websiteId?: string,
): Promise<QueryFilters> {
  const dateRange = getRequestDateRange(params);
  const filters = getRequestFilters(params);
  const eventPropertyFilters = parseUniversalEventPropertyFilters(params);
  const sessionPropertyFilters = parseSessionPropertyFilters(params);

  let match = params?.match;

  if (websiteId) {
    await setWebsiteDate(websiteId, dateRange);

    if (params.segment) {
      const segmentParams = (await getWebsiteSegment(websiteId, params.segment))?.parameters as
        Record<string, any> | undefined;

      // A stale or deleted segment id is ignored rather than failing every report.
      Object.assign(filters, filtersArrayToObject(segmentParams?.filters ?? []));
      sessionPropertyFilters.push(...(segmentParams?.sessionPropertyFilters ?? []));

      if (segmentParams?.match) {
        match = segmentParams.match;
      }
    }

    const cohortParams = params.cohort
      ? ((await getWebsiteSegment(websiteId, params.cohort))?.parameters as
          Record<string, any> | undefined)
      : undefined;

    // Cohorts need an action (the defining page/event); skip incomplete ones.
    if (cohortParams?.action?.type) {
      const { startDate, endDate } = parseDateRange(cohortParams.dateRange) ?? {};

      const cohortFilters = (cohortParams.filters ?? []).map(({ name, ...props }) => ({
        ...props,
        name: `cohort_${name}`,
      }));

      cohortFilters.push({
        name: `cohort_${cohortParams.action.type}`,
        operator: OPERATORS.equals,
        value: cohortParams.action.value,
      });

      Object.assign(filters, {
        ...filtersArrayToObject(cohortFilters),
        cohort_startDate: startDate,
        cohort_endDate: endDate,
        ...(cohortParams.match && {
          cohort_match: cohortParams.match,
          cohort_actionName: `cohort_${cohortParams.action.type}`,
        }),
      });
    }

    if (params.excludeBounce) {
      Object.assign(filters, { excludeBounce: true });
    }
  }

  return {
    ...dateRange,
    ...filters,
    match,
    minDuration: params?.minDuration,
    eventPropertyFilters,
    sessionPropertyFilters,
    page: params?.page,
    pageSize: params?.pageSize ? params?.pageSize || DEFAULT_PAGE_SIZE : undefined,
    orderBy: params?.orderBy,
    sortDescending: params?.sortDescending,
    search: params?.search,
    compare: params?.compare,
    maxResults: params?.maxResults,
  };
}
