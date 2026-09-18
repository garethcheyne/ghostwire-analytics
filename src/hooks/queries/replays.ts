'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDateRange } from '@/hooks/use-date-range';
import { useFilters } from '@/hooks/use-filters';
import { api, type PageResult } from '@/lib/api-client';

/** One recorded visit (a replay's id is its visit id). */
export interface ReplaySummary {
  id: string;
  sessionId: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  city: string | null;
  eventCount: number | string;
  chunkCount: number | string;
  startedAt: string;
  endedAt: string;
  duration: number | string;
  createdAt: string;
}

export interface SavedReplay {
  id: string;
  name: string;
  visitId: string;
  createdAt: string;
}

export interface ReplayData {
  sessionId: string | null;
  events: any[];
  startedAt: string | null;
  endedAt: string | null;
  eventCount: number;
  chunkCount: number;
}

export function useReplays(
  websiteId: string,
  { page, pageSize = 25, minDuration }: { page: number; pageSize?: number; minDuration?: number },
) {
  const { params: dateParams } = useDateRange();
  const { params: filterParams } = useFilters();
  const params = { ...dateParams, ...filterParams, page, pageSize, minDuration };

  return useQuery({
    queryKey: ['replays', websiteId, params],
    queryFn: () => api.get<PageResult<ReplaySummary>>(`/websites/${websiteId}/replays`, params),
    placeholderData: keepPreviousData,
  });
}

/** Replays for one visitor, across the whole life of their session. */
export function useSessionReplays(
  websiteId: string,
  sessionId: string,
  firstAt?: string,
  lastAt?: string,
) {
  return useQuery({
    queryKey: ['replays', websiteId, 'session', sessionId, firstAt, lastAt],
    queryFn: () =>
      api.get<PageResult<ReplaySummary>>(`/websites/${websiteId}/sessions/${sessionId}/replays`, {
        startAt: new Date(firstAt!).getTime(),
        endAt: new Date(lastAt!).getTime() + 60_000,
        pageSize: 50,
      }),
    enabled: !!firstAt && !!lastAt,
  });
}

export function useSavedReplays(websiteId: string, page: number, pageSize = 25) {
  return useQuery({
    queryKey: ['replays', websiteId, 'saved', page],
    queryFn: () =>
      api.get<PageResult<SavedReplay>>(`/websites/${websiteId}/replays/saved`, { page, pageSize }),
    placeholderData: keepPreviousData,
  });
}

export function useReplay(websiteId: string, replayId: string) {
  return useQuery({
    queryKey: ['replay', websiteId, replayId],
    queryFn: () => api.get<ReplayData>(`/websites/${websiteId}/replays/${replayId}`),
    staleTime: Infinity,
  });
}

export function useReplaySaved(websiteId: string, replayId: string) {
  return useQuery({
    queryKey: ['replays', websiteId, 'saved', 'status', replayId],
    queryFn: () =>
      api.get<{ isSaved: boolean }>(`/websites/${websiteId}/replays/saved/${replayId}`),
  });
}

export function useSetReplaySaved(websiteId: string, replayId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { isSaved: boolean; name?: string }) =>
      api.post(`/websites/${websiteId}/replays/saved/${replayId}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['replays', websiteId, 'saved'] }),
  });
}
