'use client';
import { Check, ChevronsUpDown, User, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { authClient } from '@/lib/auth-client';

/**
 * Switches between personal context and a team. Replaces Umami's /teams/:id URL prefix:
 * the choice is stored as the session's active organization.
 */
export function TeamSwitcher() {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const { data: teams } = authClient.useListOrganizations();
  const { data: activeTeam } = authClient.useActiveOrganization();

  async function select(organizationId: string | null) {
    await authClient.organization.setActive({ organizationId });
    router.refresh();
  }

  const Icon = activeTeam ? Users : User;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton variant="outline" className="data-open:bg-sidebar-accent">
              <Icon />
              <span>{activeTeam?.name ?? 'Personal'}</span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
          >
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => select(null)}>
                <User />
                Personal
                {!activeTeam && <Check className="ml-auto" />}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {teams && teams.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Teams</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {teams.map(team => (
                    <DropdownMenuItem key={team.id} onSelect={() => select(team.id)}>
                      <Users />
                      {team.name}
                      {activeTeam?.id === team.id && <Check className="ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => router.push('/settings/teams')}>
                Manage teams
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
