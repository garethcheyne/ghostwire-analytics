'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PageResult } from '@/lib/api-client';

export interface Annotation {
  id: string;
  websiteId: string;
  userId: string | null;
  /** UTC ISO timestamp. */
  date: string;
  allDay: boolean;
  note: string;
  createdAt: string;
}

const key = (websiteId: string) => ['annotations', websiteId] as const;

/** Notes for a website, optionally limited to a UTC epoch range. */
export function useAnnotations(
  websiteId: string,
  params: { startAt?: number; endAt?: number; page?: number; pageSize?: number } = {},
) {
  return useQuery({
    queryKey: [...key(websiteId), params],
    queryFn: () =>
      api.get<PageResult<Annotation>>(`/websites/${websiteId}/annotations`, {
        pageSize: 100,
        ...params,
      }),
    placeholderData: keepPreviousData,
  });
}

export function useSaveAnnotation(websiteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: { id?: string; date: Date; allDay: boolean; note: string }) =>
      api.post<Annotation>(
        id ? `/websites/${websiteId}/annotations/${id}` : `/websites/${websiteId}/annotations`,
        body,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(websiteId) }),
  });
}

export function useDeleteAnnotation(websiteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.del(`/websites/${websiteId}/annotations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key(websiteId) }),
  });
}
