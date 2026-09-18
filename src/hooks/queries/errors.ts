'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDateRange } from '@/hooks/use-date-range';
import { api, type PageResult } from '@/lib/api-client';
import type { ErrorStatus } from '@/lib/errors';
import type {
  ErrorEventDetail,
  ErrorGroupSummary,
  ErrorOccurrence,
} from '@/queries/sql/errors/getErrors';

export type { ErrorEventDetail, ErrorGroupSummary, ErrorOccurrence, ErrorStatus };

export interface SeriesPoint {
  x: string;
  y: number;
}

export interface ErrorStats {
  events: number;
  users: number;
  groups: number;
  newGroups: number;
  series: SeriesPoint[];
}

export interface ErrorGroupDetail extends Omit<ErrorGroupSummary, 'events' | 'users'> {
  resolvedAt: string | null;
  events: number;
  users: number;
  series: SeriesPoint[];
  breakdowns: Record<'pages' | 'browsers' | 'releases' | 'environments', SeriesPoint[]>;
  occurrences: ErrorOccurrence[];
}

const key = (websiteId: string) => ['errors', websiteId] as const;

export function useErrorStats(websiteId: string) {
  const { params } = useDateRange();

  return useQuery({
    queryKey: [...key(websiteId), 'stats', params],
    queryFn: () => api.get<ErrorStats>(`/websites/${websiteId}/errors/stats`, params),
    placeholderData: keepPreviousData,
  });
}

export function useErrorGroups(
  websiteId: string,
  { status, search, page }: { status: ErrorStatus; search: string; page: number },
) {
  const { params } = useDateRange();
  const query = { ...params, status, search, page, pageSize: 25 };

  return useQuery({
    queryKey: [...key(websiteId), 'groups', query],
    queryFn: () => api.get<PageResult<ErrorGroupSummary>>(`/websites/${websiteId}/errors`, query),
    placeholderData: keepPreviousData,
  });
}

export function useErrorGroup(websiteId: string, groupId: string) {
  const { params } = useDateRange();

  return useQuery({
    queryKey: [...key(websiteId), 'group', groupId, params],
    queryFn: () => api.get<ErrorGroupDetail>(`/websites/${websiteId}/errors/${groupId}`, params),
    placeholderData: keepPreviousData,
  });
}

export function useErrorEvent(websiteId: string, groupId: string, eventId?: string) {
  return useQuery({
    queryKey: [...key(websiteId), 'event', eventId],
    queryFn: () =>
      api.get<ErrorEventDetail>(`/websites/${websiteId}/errors/${groupId}/events/${eventId}`),
    enabled: !!eventId,
    staleTime: Infinity,
  });
}

export function useSetErrorStatus(websiteId: string, groupId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: ErrorStatus) =>
      api.post(`/websites/${websiteId}/errors/${groupId}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(websiteId) }),
  });
}
