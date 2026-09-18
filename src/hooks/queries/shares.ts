'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PageResult } from '@/lib/api-client';

export interface Share {
  id: string;
  entityId: string;
  name: string;
  slug: string;
  shareType: number;
  parameters: Record<string, boolean | string | undefined>;
  createdAt: string;
}

const shareKeys = {
  website: (websiteId: string) => ['shares', 'website', websiteId] as const,
};

export function useWebsiteShares(websiteId: string) {
  return useQuery({
    queryKey: shareKeys.website(websiteId),
    queryFn: () => api.get<PageResult<Share>>(`/websites/${websiteId}/shares`, { pageSize: 100 }),
  });
}

export function useSaveShare(websiteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      share,
      name,
      parameters,
    }: {
      share?: Share;
      name: string;
      parameters: Share['parameters'];
    }) =>
      share
        ? api.post<Share>(`/share/id/${share.id}`, { name, slug: share.slug, parameters })
        : api.post<Share>(`/websites/${websiteId}/shares`, { name, parameters }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shareKeys.website(websiteId) }),
  });
}

export function useDeleteShare(websiteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (shareId: string) => api.del(`/share/id/${shareId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shareKeys.website(websiteId) }),
  });
}
