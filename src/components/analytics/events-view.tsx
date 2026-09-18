'use client';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEventStats } from '@/hooks/queries/analytics';
import { formatLongNumber } from '@/lib/format';
import { EventProperties } from './event-properties';
import { EventsActivity } from './events-activity';
import { EventsChart } from './events-chart';
import { MetricsCard } from './metrics-card';
import { StatCards } from './stat-cards';
import { WebsiteHeader } from './website-header';

function EventStatsBar({ websiteId }: { websiteId: string }) {
  const { data } = useEventStats(websiteId);
  const stats = data?.data;

  return (
    <StatCards
      loading={!stats}
      stats={
        stats && [
          { label: 'Visitors', value: stats.visitors, previous: stats.comparison.visitors, format: formatLongNumber },
          { label: 'Visits', value: stats.visits, previous: stats.comparison.visits, format: formatLongNumber },
          { label: 'Events', value: stats.events, previous: stats.comparison.events, format: formatLongNumber },
          {
            label: 'Unique events',
            value: stats.uniqueEvents,
            previous: stats.comparison.uniqueEvents,
            format: formatLongNumber,
          },
        ]
      }
    />
  );
}

export function EventsView() {
  const { id } = useCurrentWebsite();

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Events" />
      <EventStatsBar websiteId={id} />
      <Tabs defaultValue="chart">
        <TabsList>
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
        </TabsList>
        <TabsContent value="chart" className="mt-4 flex flex-col gap-6">
          <Card>
            <CardContent>
              <EventsChart websiteId={id} />
            </CardContent>
          </Card>
          <MetricsCard
            websiteId={id}
            title="Events"
            tabs={[{ type: 'event', label: 'Event', valueLabel: 'Count' }]}
            limit={50}
          />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent>
              <EventsActivity websiteId={id} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="properties" className="mt-4">
          <Card>
            <CardContent>
              <EventProperties websiteId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
