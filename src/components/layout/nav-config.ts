import {
  Bell,
  Bot,
  ScrollText,
  Bug,
  Rocket,
  AlignEndHorizontal,
  ChartPie,
  Clock,
  Eye,
  Filter,
  Flame,
  Gauge,
  Globe,
  Grid2x2,
  KeyRound,
  LayoutDashboard,
  LinkIcon,
  type LucideIcon,
  Magnet,
  Network,
  PanelsTopLeft,
  Route,
  Settings,
  Settings2,
  ShieldCheck,
  Table2,
  Tag,
  Target,
  User,
  UserCircle,
  UserPlus,
  UserSearch,
  Users,
  Video,
  Wallet,
  Zap,
} from 'lucide-react';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Match the href exactly instead of as a prefix. */
  exact?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const mainNav: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: PanelsTopLeft },
      { title: 'Boards', href: '/boards', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Tracking',
    items: [
      { title: 'Websites', href: '/websites', icon: Globe },
      { title: 'Links', href: '/links', icon: LinkIcon },
      { title: 'Pixels', href: '/pixels', icon: Grid2x2 },
    ],
  },
];

export function websiteNav(websiteId: string): NavGroup[] {
  const path = (segment: string) => `/websites/${websiteId}${segment}`;

  return [
    {
      title: 'Traffic',
      items: [
        { title: 'Overview', href: path(''), icon: Eye, exact: true },
        { title: 'Events', href: path('/events'), icon: Zap },
        { title: 'Sessions', href: path('/sessions'), icon: User },
        { title: 'Realtime', href: path('/realtime'), icon: Clock },
        { title: 'Performance', href: path('/performance'), icon: Gauge },
        { title: 'Compare', href: path('/compare'), icon: AlignEndHorizontal },
        { title: 'Breakdown', href: path('/breakdown'), icon: Table2 },
      ],
    },
    {
      title: 'Behavior',
      items: [
        { title: 'Goals', href: path('/goals'), icon: Target },
        { title: 'Funnels', href: path('/funnels'), icon: Filter },
        { title: 'Journeys', href: path('/journeys'), icon: Route },
        { title: 'Retention', href: path('/retention'), icon: Magnet },
        { title: 'Replays', href: path('/replays'), icon: Video },
        { title: 'Heatmaps', href: path('/heatmaps'), icon: Flame },
        { title: 'Errors', href: path('/errors'), icon: Bug },
        { title: 'Releases', href: path('/releases'), icon: Rocket },
      ],
    },
    {
      title: 'Audience',
      items: [
        { title: 'Users', href: path('/users'), icon: UserSearch },
        { title: 'Segments', href: path('/segments'), icon: ChartPie },
        { title: 'Cohorts', href: path('/cohorts'), icon: UserPlus },
      ],
    },
    {
      title: 'Growth',
      items: [
        { title: 'UTM', href: path('/utm'), icon: Tag },
        { title: 'Revenue', href: path('/revenue'), icon: Wallet },
        { title: 'Attribution', href: path('/attribution'), icon: Network },
      ],
    },
    {
      title: 'Website',
      items: [{ title: 'Settings', href: path('/settings'), icon: Settings }],
    },
  ];
}

export const settingsNav: NavGroup[] = [
  {
    title: 'Settings',
    items: [
      { title: 'Preferences', href: '/settings/preferences', icon: Settings2 },
      { title: 'Profile', href: '/settings/profile', icon: UserCircle },
      { title: 'Teams', href: '/settings/teams', icon: Users },
      { title: 'Security', href: '/settings/security', icon: ShieldCheck },
      { title: 'Notifications', href: '/settings/notifications', icon: Bell },
      { title: 'API keys', href: '/settings/api-keys', icon: KeyRound },
      { title: 'AI agents (MCP)', href: '/settings/mcp', icon: Bot },
    ],
  },
];

export const adminNav: NavGroup[] = [
  {
    title: 'Administration',
    items: [
      { title: 'Users', href: '/admin/users', icon: User },
      { title: 'Websites', href: '/admin/websites', icon: Globe },
      { title: 'Teams', href: '/admin/teams', icon: Users },
      { title: 'Security', href: '/admin/security', icon: ShieldCheck },
      { title: 'Audit log', href: '/admin/audit', icon: ScrollText },
    ],
  },
];

/** Picks the sidebar menu for the current page, like Umami's contextual side nav. */
export function getNavForPath(pathname: string): { groups: NavGroup[]; back?: NavItem } {
  const websiteMatch = pathname.match(/^\/websites\/([0-9a-f-]{36})/);

  if (websiteMatch) {
    return {
      groups: websiteNav(websiteMatch[1]),
      back: { title: 'All websites', href: '/websites', icon: Globe },
    };
  }

  if (pathname.startsWith('/settings')) {
    return { groups: settingsNav, back: { title: 'Back', href: '/websites', icon: Globe } };
  }

  if (pathname.startsWith('/admin')) {
    return { groups: adminNav, back: { title: 'Back', href: '/websites', icon: Globe } };
  }

  return { groups: mainNav };
}

export function isNavItemActive(item: NavItem, pathname: string) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}
