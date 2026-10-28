'use client';
import { AppShell, useSidebar } from '@/components/app-shell';
import { cn } from '@/lib/utils';
import { getNavForPath, mobileTabs } from './nav-config';
import { TeamSwitcher } from './team-switcher';
import { type HeaderUser, UserMenu } from './user-menu';

/**
 * The app frame for signed-in pages. A client component because the nav carries icon components,
 * which can't be passed from the server layout.
 */
export function Shell({
  user,
  version,
  defaultOpen,
  children,
}: {
  user: HeaderUser;
  version: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <AppShell
      product={{
        name: 'Ghostwire Analytics',
        line: 'Analytics',
        logo: '/logo.png',
        logoLight: '/logo-black.png',
        href: '/websites',
      }}
      nav={getNavForPath}
      mobileTabs={mobileTabs}
      version={version}
      sidebarTop={<SidebarTeamSwitcher />}
      userMenu={<UserMenu user={user} />}
      defaultOpen={defaultOpen}
      mainClassName="flex flex-col gap-6"
    >
      {children}
    </AppShell>
  );
}

/**
 * The team switcher under the logo, lined up with the menu below it: the menu's inset on phones,
 * centred over the icons when collapsed, and clear of the collapse button when expanded.
 */
function SidebarTeamSwitcher() {
  const { isMobile, state } = useSidebar();

  return (
    <div className={cn('pt-4', isMobile ? 'px-3' : state === 'collapsed' ? 'px-4' : 'pr-4 pl-2')}>
      <TeamSwitcher />
    </div>
  );
}
