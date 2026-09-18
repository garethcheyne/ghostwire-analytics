'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface AppConfig {
  faviconUrl?: string;
  linksUrl?: string;
  pixelsUrl?: string;
  privateMode: boolean;
  sessionDeletionEnabled: boolean;
  trackerScriptName?: string;
}

/** Server settings that affect the UI (e.g. a custom tracker script name). */
export function useAppConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => api.get<AppConfig>('/config'),
    staleTime: Infinity,
  });
}
