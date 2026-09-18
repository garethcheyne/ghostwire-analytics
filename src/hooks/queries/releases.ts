'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import type { ReleaseSummary } from '@/queries/sql/releases/getReleases';

export type { ReleaseSummary };

export function useReleases(websiteId: string, enabled = true) {
  return useQuery({
    queryKey: ['releases', websiteId],
    queryFn: () => api.get<ReleaseSummary[]>(`/websites/${websiteId}/releases`),
    enabled: enabled && !!websiteId,
    staleTime: 60_000,
  });
}
