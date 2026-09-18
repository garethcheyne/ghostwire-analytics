'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export type ChannelType = 'email' | 'slack' | 'discord' | 'telegram' | 'webhook';
export type AlertType = 'error.new' | 'error.regression' | 'error.spike' | 'traffic.drop';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  userId: string | null;
  teamId: string | null;
  config: { url?: string; emails?: string[]; chatId?: string; hasSecret?: boolean };
  createdAt: string;
}

export interface AlertRule {
  type: AlertType;
  enabled: boolean;
  channelIds: string[];
  parameters: Record<string, number>;
  lastTriggeredAt: string | null;
}

export interface AlertLogEntry {
  id: string;
  type: AlertType;
  title: string;
  status: 'sent' | 'failed';
  error: string | null;
  channelId: string | null;
  createdAt: string;
}

export interface ChannelInput {
  name: string;
  type: ChannelType;
  config: { url?: string; secret?: string; emails?: string[]; chatId?: string };
}

const keys = {
  channels: (teamId: string | null) => ['channels', teamId] as const,
  alerts: (websiteId: string) => ['alerts', websiteId] as const,
};

export function useChannels(teamId: string | null, enabled = true) {
  return useQuery({
    queryKey: keys.channels(teamId),
    queryFn: () =>
      api.get<{ data: Channel[]; emailConfigured: boolean }>(
        '/notification-channels',
        teamId ? { teamId } : {},
      ),
    enabled,
  });
}

export function useSaveChannel(teamId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...input }: ChannelInput & { id?: string }) =>
      id
        ? api.post<Channel>(`/notification-channels/${id}`, input)
        : api.post<Channel>('/notification-channels', { ...input, ...(teamId && { teamId }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useDeleteChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.del(`/notification-channels/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });
}

export function useTestChannel() {
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ ok: boolean; error?: string }>(`/notification-channels/${id}/test`, {}),
  });
}

export function useWebsiteAlerts(websiteId: string) {
  return useQuery({
    queryKey: keys.alerts(websiteId),
    queryFn: () =>
      api.get<{ rules: AlertRule[]; channels: Channel[]; log: AlertLogEntry[] }>(
        `/websites/${websiteId}/alerts`,
      ),
  });
}

export function useSaveAlertRule(websiteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rule: Omit<AlertRule, 'lastTriggeredAt'>) =>
      api.post(`/websites/${websiteId}/alerts`, rule),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.alerts(websiteId) }),
  });
}
