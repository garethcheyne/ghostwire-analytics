'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type PageResult } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';

export interface TeamMember {
  id: string;
  userId: string;
  role: string;
  createdAt: string;
  user: { id: string; username: string | null; name?: string | null };
}

export interface Team {
  id: string;
  name: string;
  accessCode: string | null;
  twoFactorRequired: boolean;
  createdAt: string;
  members: TeamMember[];
  _count: { websites: number; members: number };
}

const keys = {
  all: ['teams'] as const,
  mine: ['teams', 'mine'] as const,
  detail: (teamId: string) => ['teams', teamId] as const,
  members: (teamId: string) => ['teams', teamId, 'members'] as const,
};

/** Tell the sidebar's team switcher (Better Auth's organization list) to reload. */
function refreshTeamSwitcher() {
  authClient.$store.notify('$listOrg');
}

export function useMyTeams() {
  return useQuery({
    queryKey: keys.mine,
    queryFn: () => api.get<PageResult<Team>>('/me/teams', { pageSize: 100 }),
  });
}

export function useTeam(teamId: string) {
  return useQuery({
    queryKey: keys.detail(teamId),
    queryFn: () => api.get<Team>(`/teams/${teamId}`),
  });
}

export function useTeamMembers(teamId: string) {
  return useQuery({
    queryKey: keys.members(teamId),
    queryFn: () => api.get<PageResult<TeamMember>>(`/teams/${teamId}/users`, { pageSize: 200 }),
  });
}

function useTeamMutation<T>(fn: (input: T) => Promise<unknown>) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keys.all });
      refreshTeamSwitcher();
    },
  });
}

export const useCreateTeam = () =>
  useTeamMutation((name: string) => api.post<Team>('/teams', { name }));

export const useJoinTeam = () =>
  useTeamMutation((accessCode: string) => api.post('/teams/join', { accessCode }));

export const useUpdateTeam = (teamId: string) =>
  useTeamMutation((data: { name?: string; accessCode?: string; twoFactorRequired?: boolean }) =>
    api.post<Team>(`/teams/${teamId}`, data),
  );

export const useDeleteTeam = (teamId: string) => useTeamMutation(() => api.del(`/teams/${teamId}`));

export const useSetMemberRole = (teamId: string) =>
  useTeamMutation(({ userId, role }: { userId: string; role: string }) =>
    api.post(`/teams/${teamId}/users/${userId}`, { role }),
  );

export const useRemoveMember = (teamId: string) =>
  useTeamMutation((userId: string) => api.del(`/teams/${teamId}/users/${userId}`));

/** A fresh, hard-to-guess access code for joining a team. */
export function generateAccessCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return `team_${Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')}`;
}
