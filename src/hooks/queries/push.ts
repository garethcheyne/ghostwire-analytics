'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';

export interface PushDevice {
  id: string;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

const key = ['push'];

export function usePushDevices() {
  return useQuery({
    queryKey: key,
    queryFn: () => api.get<{ publicKey: string; devices: PushDevice[] }>('/push'),
  });
}

export function useSavePushSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subscription: PushSubscriptionJSON) =>
      api.post<{ id: string }>('/push/subscriptions', subscription),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useRemovePushDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/push/subscriptions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

export function useTestPush() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ sent: number; failed: number; removed: number; errors: string[] }>('/push/test'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
