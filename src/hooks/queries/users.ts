'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
