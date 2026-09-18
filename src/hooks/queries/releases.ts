'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export interface SourceMapRelease {
  release: string;
  files: number;
  size: number;
  uploadedAt: string;
}

export function useSourceMaps(websiteId: string) {
  return useQuery({
    queryKey: ['sourcemaps', websiteId],
    queryFn: () => api.get<SourceMapRelease[]>(`/websites/${websiteId}/sourcemaps`),
  });
}

export function useDeleteSourceMaps(websiteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (release: string) =>
      api.del(`/websites/${websiteId}/sourcemaps?release=${encodeURIComponent(release)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sourcemaps', websiteId] }),
  });
}
