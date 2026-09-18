'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveTeam } from '@/hooks/use-active-team';
import { api, type PageResult } from '@/lib/api-client';
import type { BoardParameters } from '@/lib/types';

export interface BoardSummary {
  id: string;
  name: string;
  description: string;
  type: string;
  userId: string | null;
  teamId: string | null;
  parameters: BoardParameters;
  createdAt: string;
  updatedAt: string | null;
}

const keys = {
  all: ['boards'] as const,
  list: (teamId: string | null, search: string) => ['boards', 'list', teamId, search] as const,
  detail: (boardId: string) => ['boards', boardId] as const,
  dashboard: ['boards', 'dashboard'] as const,
};

export function useBoards(search = '') {
  const { teamId, isPending } = useActiveTeam();

  return useQuery({
    queryKey: keys.list(teamId, search),
    queryFn: () =>
      api.get<PageResult<BoardSummary>>(teamId ? `/teams/${teamId}/boards` : '/boards', {
        search,
        pageSize: 100,
      }),
    enabled: !isPending,
  });
}

export function useBoard(boardId: string) {
  return useQuery({
    queryKey: keys.detail(boardId),
    queryFn: () => api.get<BoardSummary>(`/boards/${boardId}`),
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  const { teamId } = useActiveTeam();

  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      api.post<BoardSummary>('/boards', {
        ...data,
        type: 'mixed',
        parameters: { rows: [] },
        ...(teamId && { teamId }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useSaveBoard(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name?: string; description?: string; parameters?: BoardParameters }) =>
      api.post<BoardSummary>(`/boards/${boardId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (boardId: string) => api.del(`/boards/${boardId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

/** Your personal dashboard (a board stored under your user id). */
export function useDashboard() {
  return useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.get<BoardSummary | null>('/dashboard'),
  });
}

export function useSaveDashboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (parameters: BoardParameters) =>
      api.post<BoardSummary>('/dashboard', { name: 'Dashboard', parameters }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.dashboard }),
  });
}
