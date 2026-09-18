'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PageResult } from '@/lib/api-client';

export type SegmentType = 'segment' | 'cohort';

export interface SegmentFilter {
  name: string;
  operator: string;
  value: string;
}

export interface SegmentParameters {
  filters?: SegmentFilter[];
  match?: 'all' | 'any';
  /** Cohorts only: the period the action happened in, e.g. "30day". */
  dateRange?: string;
  /** Cohorts only: the page view or event that defines the cohort. */
  action?: { type: string; value: string };
}

export interface Segment {
  id: string;
  type: SegmentType;
  name: string;
  parameters: SegmentParameters;
  createdAt: string;
}

const key = (websiteId: string, type: SegmentType) => ['segments', websiteId, type] as const;

export function useSegments(websiteId: string, type: SegmentType) {
  return useQuery({
    queryKey: key(websiteId, type),
    queryFn: () =>
      api.get<PageResult<Segment>>(`/websites/${websiteId}/segments`, { type, pageSize: 100 }),
  });
}

export function useSaveSegment(websiteId: string, type: SegmentType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name, parameters }: { id?: string; name: string; parameters: SegmentParameters }) =>
      id
        ? api.post<Segment>(`/websites/${websiteId}/segments/${id}`, { type, name, parameters })
        : api.post<Segment>(`/websites/${websiteId}/segments`, { type, name, parameters }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(websiteId, type) }),
  });
}

export function useDeleteSegment(websiteId: string, type: SegmentType) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.del(`/websites/${websiteId}/segments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(websiteId, type) }),
  });
}
