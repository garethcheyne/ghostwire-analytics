'use client';
import { authClient } from '@/lib/auth-client';

/** The team chosen in the sidebar switcher, or null for personal context. */
export function useActiveTeam() {
  const { data, isPending } = authClient.useActiveOrganization();

  return { team: data ?? null, teamId: data?.id ?? null, isPending };
}
