'use client';
import { ArrowLeft } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { getNavForPath, isNavItemActive } from './nav-config';
import { TeamSwitcher } from './team-switcher';

export function AppSidebar({ version }: { version: string }) {
  const pathname = usePathname();
  const { groups, back } = getNavForPath(pathname);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/websites">
                <Image
                  src="/logo.png"
                  alt="Ghostwire"
                  width={32}
                  height={32}
                  className="size-8 object-contain"
                />
                <div className="flex flex-col leading-tight">
                  <span className="text-brand-gradient text-lg font-bold">Ghostwire</span>
                  <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
                    Analytics
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <TeamSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {back && (
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip={back.title}>
                  <Link href={back.href}>
                    <ArrowLeft />
                    <span>{back.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
        )}
        {groups.map(group => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map(item => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isNavItemActive(item, pathname)}
                      tooltip={item.title}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between px-2 py-1 group-data-[collapsible=icon]:hidden">
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">Version</span>
          <span className="font-mono text-[10px] text-muted-foreground">{version}</span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
