'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveTeam } from '@/hooks/use-active-team';
import { api, type PageResult } from '@/lib/api-client';

export interface Website {
  id: string;
  name: string;
  domain: string | null;
  userId: string | null;
  teamId: string | null;
  createdAt: string;
  resetAt: string | null;
  shareId: string | null;
  recorderEnabled: boolean;
  replayConfig: ReplayConfig | null;
  errorsEnabled: boolean;
  /** Last characters of the error ingest key, if one exists (the key itself is shown once). */
  errorKeyHint: string | null;
  user?: { id: string; username: string | null } | null;
  createUser?: { id: string; username: string | null } | null;
}

export interface ReplayConfig {
  replayEnabled?: boolean;
  heatmapEnabled?: boolean;
  sampleRate?: number;
  heatmapSampleRate?: number;
  maskLevel?: 'strict' | 'moderate';
  maxDuration?: number;
  blockSelector?: string;
  maskTextSelector?: string;
  hideMedia?: boolean;
  excludePaths?: string[];
}

export interface WebsiteListParams {
  search?: string;
  page?: number;
  pageSize?: number;
}

export const websiteKeys = {
  all: ['websites'] as const,
  list: (teamId: string | null, params: WebsiteListParams) =>
    ['websites', 'list', teamId, params] as const,
  detail: (websiteId: string) => ['websites', 'detail', websiteId] as const,
};

/** Websites for the current context: the active team's, or the user's own. */
export function useWebsites(params: WebsiteListParams = {}) {
  const { teamId, isPending } = useActiveTeam();

  return useQuery({
    queryKey: websiteKeys.list(teamId, params),
    queryFn: () =>
      api.get<PageResult<Website>>(teamId ? `/teams/${teamId}/websites` : '/websites', {
        ...params,
      }),
    enabled: !isPending,
  });
}

export function useWebsite(websiteId: string) {
  return useQuery({
    queryKey: websiteKeys.detail(websiteId),
    queryFn: () => api.get<Website>(`/websites/${websiteId}`),
  });
}

export function useCreateWebsite() {
  const queryClient = useQueryClient();
  const { teamId } = useActiveTeam();

  return useMutation({
    mutationFn: (data: { name: string; domain: string }) =>
      api.post<Website>('/websites', { ...data, teamId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: websiteKeys.all }),
  });
}

export function useUpdateWebsite(websiteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      data: Partial<Pick<Website, 'name' | 'domain' | 'replayConfig' | 'errorsEnabled'>>,
    ) => api.post<Website>(`/websites/${websiteId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: websiteKeys.all }),
  });
}

export function useDeleteWebsite(websiteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.del(`/websites/${websiteId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: websiteKeys.all }),
  });
}

export function useResetWebsite(websiteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.post(`/websites/${websiteId}/reset`),
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
