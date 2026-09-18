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
