'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PageResult } from '@/lib/api-client';
import type { WebsiteUser } from '@/queries/sql/users/getWebsiteUsers';
import type { WebsiteUserDetail } from '@/queries/sql/users/getWebsiteUser';

export type { WebsiteUser, WebsiteUserDetail };

/** Identified users, searched by user ID or any value passed to identify (email, name...). */
export function useWebsiteUsers(websiteId: string, search: string, page: number, pageSize = 25) {
  return useQuery({
    queryKey: ['users', websiteId, search, page, pageSize],
    queryFn: () =>
      api.get<PageResult<WebsiteUser>>(`/websites/${websiteId}/users`, { search, page, pageSize }),
    placeholderData: keepPreviousData,
  });
}

export function useWebsiteUser(websiteId: string, userId: string) {
  return useQuery({
    queryKey: ['users', websiteId, 'detail', userId],
    queryFn: () =>
      api.get<WebsiteUserDetail>(`/websites/${websiteId}/users/${encodeURIComponent(userId)}`),
  });
}

export interface SupportLink {
  id: string;
  slug: string;
  includeReplays: boolean;
  note: string | null;
  expiresAt: string;
  createdAt: string;
}

const supportKey = (websiteId: string, userId: string) =>
  ['users', websiteId, 'support-links', userId] as const;

export function useSupportLinks(websiteId: string, userId: string, enabled = true) {
  return useQuery({
    queryKey: supportKey(websiteId, userId),
    queryFn: () =>
      api.get<SupportLink[]>(
        `/websites/${websiteId}/users/${encodeURIComponent(userId)}/support-links`,
      ),
    enabled,
  });
}

export function useCreateSupportLink(websiteId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { days: number; includeReplays: boolean; note?: string }) =>
      api.post<SupportLink>(
        `/websites/${websiteId}/users/${encodeURIComponent(userId)}/support-links`,
        input,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supportKey(websiteId, userId) }),
  });
}

export function useRevokeSupportLink(websiteId: string, userId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (linkId: string) => api.del(`/support-links/${linkId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: supportKey(websiteId, userId) }),
  });
}
