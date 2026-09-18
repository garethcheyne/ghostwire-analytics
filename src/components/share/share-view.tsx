'use client';
import { useQuery } from '@tanstack/react-query';
import { Ghost, LinkIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ComponentType } from 'react';
import { BreakdownView } from '@/components/analytics/breakdown-view';
import { CompareView } from '@/components/analytics/compare-view';
import { EventsView } from '@/components/analytics/events-view';
import { PerformanceView } from '@/components/analytics/performance-view';
import { RealtimeView } from '@/components/analytics/realtime-view';
import { SessionsView } from '@/components/analytics/sessions-view';
import { WebsiteOverview } from '@/components/analytics/website-overview';
import { AttributionView } from '@/components/reports/attribution-view';
import { FunnelsView } from '@/components/reports/funnels-view';
import { GoalsView } from '@/components/reports/goals-view';
import { JourneysView } from '@/components/reports/journeys-view';
import { RetentionView } from '@/components/reports/retention-view';
import { RevenueView } from '@/components/reports/revenue-view';
import { UtmView } from '@/components/reports/utm-view';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WebsiteProvider } from '@/components/websites/website-context';
import { api, setShareToken } from '@/lib/api-client';
import { ShareProvider } from './share-context';

// Views a website share can expose, in menu order (ids match the share's parameters).
const SECTIONS: { id: string; label: string; View: ComponentType }[] = [
  { id: 'overview', label: 'Overview', View: WebsiteOverview },
  { id: 'events', label: 'Events', View: EventsView },
  { id: 'sessions', label: 'Sessions', View: SessionsView },
  { id: 'realtime', label: 'Realtime', View: RealtimeView },
  { id: 'performance', label: 'Performance', View: PerformanceView },
  { id: 'compare', label: 'Compare', View: CompareView },
  { id: 'breakdown', label: 'Breakdown', View: BreakdownView },
  { id: 'goals', label: 'Goals', View: GoalsView },
  { id: 'funnels', label: 'Funnels', View: FunnelsView },
  { id: 'journeys', label: 'Journeys', View: JourneysView },
  { id: 'retention', label: 'Retention', View: RetentionView },
  { id: 'utm', label: 'UTM', View: UtmView },
  { id: 'revenue', label: 'Revenue', View: RevenueView },
  { id: 'attribution', label: 'Attribution', View: AttributionView },
];

interface ShareData {
  shareType: number;
  websiteId?: string;
  parameters: Record<string, unknown>;
  token: string;
}

function Unavailable({ title, description }: { title: string; description: string }) {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LinkIcon />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** A public, read-only view of a shared website, for anyone with the link. */
export function ShareView({ slug }: { slug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const {
    data: share,
    isPending,
    error,
  } = useQuery({
    queryKey: ['share', slug],
    queryFn: async () => {
      const data = await api.get<ShareData>(`/share/${encodeURIComponent(slug)}`);
      // Every request from here on authenticates with the share.
      setShareToken(data.token);
      return data;
    },
    retry: false,
    staleTime: Infinity,
  });
  const { data: website } = useQuery({
    queryKey: ['share', slug, 'website', share?.websiteId],
    queryFn: () =>
      api.get<{ id: string; name: string; domain: string | null }>(`/websites/${share!.websiteId}`),
    enabled: !!share?.websiteId,
  });

  if (isPending || (share?.websiteId && !website)) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !share) {
    return (
      <Unavailable
        title="This link doesn't work"
        description="The share may have been turned off or the link mistyped."
      />
    );
  }

  const sections = SECTIONS.filter(section => share.parameters[section.id] === true);

  if (!share.websiteId || !website || !sections.length) {
    return (
      <Unavailable
        title="Nothing to show"
        description="This share doesn't include any website reports."
      />
    );
  }

  const requested = searchParams.get('view');
  const active = sections.find(section => section.id === requested) ?? sections[0];
  const View = active.View;

  const setView = (id: string) => {
    const params = new URLSearchParams(searchParams);
    if (id === sections[0].id) params.delete('view');
    else params.set('view', id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <ShareProvider
      value={{
        slug,
        sections: Object.fromEntries(sections.map(section => [section.id, true])),
        allowFilter: share.parameters.allowFilter !== false,
      }}
    >
      <WebsiteProvider
        website={{
          id: website.id,
          name: website.name,
          domain: website.domain,
          teamId: null,
          userId: null,
          canUpdate: false,
          canDelete: false,
        }}
      >
        <div className="flex flex-col gap-6">
          {sections.length > 1 && (
            <Tabs value={active.id} onValueChange={setView}>
              <TabsList className="h-auto max-w-full flex-wrap justify-start">
                {sections.map(section => (
                  <TabsTrigger key={section.id} value={section.id}>
                    {section.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <View />
        </div>
      </WebsiteProvider>
    </ShareProvider>
  );
}

export function ShareFooter() {
  return (
    <footer className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
      <Ghost className="size-3.5" />
      Shared with Ghostwire Analytics
    </footer>
  );
}
