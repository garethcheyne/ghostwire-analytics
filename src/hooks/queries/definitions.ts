'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PageResult } from '@/lib/api-client';

/**
 * Saved report definitions (goals, funnels...) for a website. Stored as `report` rows by the
 * API; each kind has list/create at /websites/[id]/<kind> and get/update/delete at /<kind>/[id].
 */
export type DefinitionKind = 'goals' | 'funnels';

export interface Definition<P> {
  id: string;
  name: string;
  description: string;
  parameters: P;
  createdAt: string;
}

export interface GoalParameters {
  type: 'path' | 'event';
  value: string;
}

export interface FunnelStep {
  type: 'path' | 'event';
  value: string;
}

export interface FunnelParameters {
  window: number;
  steps: FunnelStep[];
}

const keys = {
  list: (websiteId: string, kind: DefinitionKind) => ['definitions', websiteId, kind] as const,
};

export function useDefinitions<P>(websiteId: string, kind: DefinitionKind) {
  return useQuery({
    queryKey: keys.list(websiteId, kind),
    queryFn: () =>
      api.get<PageResult<Definition<P>>>(`/websites/${websiteId}/${kind}`, { pageSize: 100 }),
    enabled: !!websiteId,
  });
}

export function useSaveDefinition<P>(websiteId: string, kind: DefinitionKind) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id?: string;
      name: string;
      description?: string;
      parameters: P;
    }) =>
      id
        ? api.post<Definition<P>>(`/websites/${websiteId}/${kind}/${id}`, body)
        : api.post<Definition<P>>(`/websites/${websiteId}/${kind}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.list(websiteId, kind) }),
  });
}

export function useDeleteDefinition(websiteId: string, kind: DefinitionKind) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.del(`/websites/${websiteId}/${kind}/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.list(websiteId, kind) }),
  });
}
