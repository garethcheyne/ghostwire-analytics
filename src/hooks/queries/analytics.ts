'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDateRange } from '@/hooks/use-date-range';
import { useFilters } from '@/hooks/use-filters';
import { api } from '@/lib/api-client';

export interface WebsiteStats {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
  comparison: Omit<WebsiteStats, 'comparison'>;
}

export interface SeriesPoint {
  x: string;
  y: number;
}

export interface MetricRow {
  x: string | null;
  y: number;
}

/** Shared query parameters: date range + filters from the URL. */
function useAnalyticsParams() {
  const { params: dateParams, compare } = useDateRange();
  const { params: filterParams } = useFilters();

  return { ...dateParams, ...filterParams, compare };
}

/**
 * GET /api/websites/[id]/<path> with the current date range and filters. The query key
 * includes all parameters, so changing the date or a filter refetches.
 */
export function useAnalyticsQuery<T>(
  websiteId: string,
  path: string,
  extra: Record<string, string | number | boolean | undefined> = {},
  options: { enabled?: boolean } = {},
) {
  const params = useAnalyticsParams();

  return useQuery({
    queryKey: ['analytics', websiteId, path, extra, params],
    queryFn: () => api.get<T>(`/websites/${websiteId}/${path}`, { ...params, ...extra }),
    placeholderData: keepPreviousData,
    enabled: options.enabled,
  });
}

export function useWebsiteStats(websiteId: string) {
  const params = useAnalyticsParams();

  return useQuery({
    queryKey: ['analytics', websiteId, 'stats', params],
    queryFn: () => api.get<WebsiteStats>(`/websites/${websiteId}/stats`, params),
    placeholderData: keepPreviousData,
  });
}

export function useWebsitePageviews(websiteId: string) {
  const params = useAnalyticsParams();

  return useQuery({
    queryKey: ['analytics', websiteId, 'pageviews', params],
    queryFn: () =>
      api.get<{ pageviews: SeriesPoint[]; sessions: SeriesPoint[] }>(
        `/websites/${websiteId}/pageviews`,
        params,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useWebsiteMetrics(websiteId: string, type: string, limit = 10) {
  const params = useAnalyticsParams();

  return useQuery({
    queryKey: ['analytics', websiteId, 'metrics', type, limit, params],
    queryFn: () =>
      api.get<MetricRow[]>(`/websites/${websiteId}/metrics`, { ...params, type, limit }),
    placeholderData: keepPreviousData,
  });
}

export function useActiveVisitors(websiteId: string) {
  return useQuery({
    queryKey: ['analytics', websiteId, 'active'],
    queryFn: () => api.get<{ visitors: number }>(`/websites/${websiteId}/active`),
    refetchInterval: 30_000,
  });
}

export function useWebsiteDateRange(websiteId: string) {
  return useQuery({
    queryKey: ['analytics', websiteId, 'daterange'],
    queryFn: () =>
      api.get<{ startDate: string | null; endDate: string | null }>(
        `/websites/${websiteId}/daterange`,
      ),
    staleTime: 5 * 60_000,
  });
}

// Events

export interface EventStats {
  events: number;
  visitors: number;
  visits: number;
  uniqueEvents: number;
  comparison: Omit<EventStats, 'comparison'>;
}

export interface EventSeriesPoint {
  x: string;
  t: string;
  y: number;
}

export interface WebsiteEvent {
  id: string;
  sessionId: string;
  createdAt: string;
  hostname: string | null;
  urlPath: string;
  urlQuery: string | null;
  referrerDomain: string | null;
  country: string | null;
  city: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  pageTitle: string | null;
  eventType: number;
  eventName: string | null;
  hasData: boolean;
}

export interface EventProperty {
  eventName: string;
  propertyName: string;
  dataType: number;
  total: number;
}

export const useEventStats = (websiteId: string) =>
  useAnalyticsQuery<{ data: EventStats }>(websiteId, 'events/stats');

export const useEventSeries = (websiteId: string, limit = 10) =>
  useAnalyticsQuery<EventSeriesPoint[]>(websiteId, 'events/series', { limit });

export const useWebsiteEvents = (websiteId: string, page: number, pageSize = 25) =>
  useAnalyticsQuery<{ data: WebsiteEvent[]; count: number; page: number; pageSize: number }>(
    websiteId,
    'events',
    { page, pageSize },
  );

export const useEventProperties = (websiteId: string) =>
  useAnalyticsQuery<EventProperty[]>(websiteId, 'event-data/properties');

export const useEventPropertyValues = (websiteId: string, event: string, propertyName: string) =>
  useAnalyticsQuery<{ value: string; total: number }[]>(
    websiteId,
    'event-data/values',
    { event, propertyName },
    { enabled: !!event && !!propertyName },
  );

// Sessions

export interface SessionSummary {
  id: string;
  hostname: string | null;
  browser: string | null;
  os: string | null;
  device: string | null;
  screen: string | null;
  language: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  firstAt: string;
  lastAt: string;
  visits: number;
  views: number;
  events: number;
}

export interface SessionDetail extends Omit<SessionSummary, 'views' | 'events' | 'hostname'> {
  views: number | string;
  events: number | string;
  totaltime: number | string;
  canDelete: boolean;
  distinctIds: string[];
}

export interface SessionActivityItem {
  createdAt: string;
  urlPath: string;
  urlQuery: string | null;
  referrerDomain: string | null;
  eventId: string;
  eventType: number;
  eventName: string | null;
  visitId: string;
  hostname: string | null;
  hasData: boolean;
}

export interface SessionProperty {
  dataKey: string;
  stringValue: string | null;
  numberValue: number | null;
  dateValue: string | null;
  dataType: number;
}

type Countable = { value: number };

export const useSessionStats = (websiteId: string) =>
  useAnalyticsQuery<{
    pageviews: Countable;
    visitors: Countable;
    visits: Countable;
    countries: Countable;
    events: Countable;
  }>(websiteId, 'sessions/stats');

export const useWeeklyTraffic = (websiteId: string) =>
  useAnalyticsQuery<number[][]>(websiteId, 'sessions/weekly');

export const useWebsiteSessions = (websiteId: string, page: number, pageSize = 25) =>
  useAnalyticsQuery<{ data: SessionSummary[]; count: number; page: number; pageSize: number }>(
    websiteId,
    'sessions',
    { page, pageSize },
  );

export function useSession(websiteId: string, sessionId: string) {
  return useQuery({
    queryKey: ['analytics', websiteId, 'session', sessionId],
    queryFn: () => api.get<SessionDetail>(`/websites/${websiteId}/sessions/${sessionId}`),
  });
}

export function useSessionActivity(websiteId: string, sessionId: string, firstAt?: string, lastAt?: string) {
  return useQuery({
    queryKey: ['analytics', websiteId, 'session', sessionId, 'activity', firstAt, lastAt],
    queryFn: () =>
      api.get<SessionActivityItem[]>(`/websites/${websiteId}/sessions/${sessionId}/activity`, {
        // The whole life of the session, regardless of the dashboard's date range.
        startAt: new Date(firstAt!).getTime(),
        endAt: new Date(lastAt!).getTime() + 1000,
      }),
    enabled: !!firstAt && !!lastAt,
  });
}

export function useSessionProperties(websiteId: string, sessionId: string) {
  return useQuery({
    queryKey: ['analytics', websiteId, 'session', sessionId, 'properties'],
    queryFn: () =>
      api.get<SessionProperty[]>(`/websites/${websiteId}/sessions/${sessionId}/properties`),
  });
}
