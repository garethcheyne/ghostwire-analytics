'use client';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { MetricsCard } from './metrics-card';
import { StatsBar } from './stats-bar';
import { TrafficChart } from './traffic-chart';
import { WebsiteHeader } from './website-header';

// Browser-only: the map's projection maths differs by a rounding error between server and client.
const WorldMap = dynamic(() => import('./world-map').then(m => m.WorldMap), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />,
});

export function WebsiteOverview() {
  const { id } = useCurrentWebsite();

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader />
      <StatsBar websiteId={id} />
      <TrafficChart websiteId={id} />
      <div className="grid gap-6 lg:grid-cols-2">
        <MetricsCard
          websiteId={id}
          title="Pages"
          tabs={[
            { type: 'path', label: 'Pages' },
            { type: 'entry', label: 'Entry' },
            { type: 'exit', label: 'Exit' },
            { type: 'title', label: 'Titles' },
          ]}
        />
        <MetricsCard
          websiteId={id}
          title="Sources"
          tabs={[
            { type: 'referrer', label: 'Referrers' },
            { type: 'channel', label: 'Channels' },
          ]}
        />
        <MetricsCard
          websiteId={id}
          title="Environment"
          tabs={[
            { type: 'browser', label: 'Browsers' },
            { type: 'os', label: 'OS' },
            { type: 'device', label: 'Devices' },
          ]}
        />
        <MetricsCard
          websiteId={id}
          title="Location"
          tabs={[
            { type: 'country', label: 'Countries' },
            { type: 'region', label: 'Regions' },
            { type: 'city', label: 'Cities' },
            { type: 'language', label: 'Languages' },
          ]}
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WorldMap websiteId={id} />
        </div>
        <MetricsCard
          websiteId={id}
          title="Events"
          tabs={[{ type: 'event', label: 'Events', valueLabel: 'Count' }]}
        />
      </div>
    </div>
  );
}
