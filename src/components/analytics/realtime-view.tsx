'use client';
import { useQuery } from '@tanstack/react-query';
import { format, subMinutes } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Eye, UserPlus, Zap } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useTimezone } from '@/hooks/use-timezone';
import { api } from '@/lib/api-client';
import { REALTIME_INTERVAL, REALTIME_RANGE } from '@/lib/constants';
import { generateTimeSeries } from '@/lib/date';
import { formatLongNumber } from '@/lib/format';
import { formatMetricLabel } from './metric-labels';
import { StatCards } from './stat-cards';
import { AppLink } from '@/components/share/share-context';

const WorldMap = dynamic(() => import('./world-map').then(m => m.WorldMap), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />,
});

interface RealtimeEvent {
  __type: 'pageview' | 'session' | 'event';
  sessionId: string;
  eventName: string | null;
  createdAt: string;
  browser: string | null;
  os: string | null;
  device: string | null;
  country: string | null;
  urlPath: string;
  referrerDomain: string | null;
}

interface RealtimeData {
  countries: Record<string, number>;
  urls: Record<string, number>;
  referrers: Record<string, number>;
  events: RealtimeEvent[];
  series: { views: { x: string; y: number }[]; visitors: { x: string; y: number }[] };
  totals: { views: number; visitors: number; events: number; countries: number };
  timestamp: number;
}

const chartConfig = {
  visitors: { label: 'Visitors', color: 'var(--chart-1)' },
  views: { label: 'Views', color: 'var(--chart-2)' },
} satisfies ChartConfig;

function TopList({ title, rows, type }: { title: string; rows: Record<string, number>; type: string }) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = Math.max(1, ...entries.map(([, count]) => count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nothing in the last {REALTIME_RANGE} minutes.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {entries.map(([key, count]) => (
              <li key={key} className="relative">
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
                  style={{ width: `${(count / max) * 100}%` }}
                  aria-hidden
                />
                <div className="relative flex items-center gap-3 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{formatMetricLabel(type, key)}</span>
                  <span className="font-medium tabular-nums">{formatLongNumber(count)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LiveLog({ websiteId, events }: { websiteId: string; events: RealtimeEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live activity</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Waiting for visitors…</p>
        ) : (
          <ScrollArea className="h-80 pr-3">
            <ul className="flex flex-col gap-1">
              {events.map((event, index) => {
                const Icon =
                  event.__type === 'session' ? UserPlus : event.__type === 'event' ? Zap : Eye;
                const text =
                  event.__type === 'session'
                    ? `New visitor from ${formatMetricLabel('country', event.country)} on ${formatMetricLabel('browser', event.browser)}, ${formatMetricLabel('os', event.os)}`
                    : event.__type === 'event'
                      ? `${event.eventName} on ${event.urlPath}`
                      : `Viewed ${event.urlPath}`;

                return (
                  <li
                    key={`${event.__type}-${event.sessionId}-${event.createdAt}-${index}`}
                    className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">
                      {format(new Date(event.createdAt), 'h:mm:ss a')}
                    </span>
                    <Icon
                      className={
                        event.__type === 'session'
                          ? 'size-4 shrink-0 text-status-online'
                          : event.__type === 'event'
                            ? 'size-4 shrink-0 text-chart-4'
                            : 'size-4 shrink-0 text-muted-foreground'
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{text}</span>
                    <AppLink
                      href={`/websites/${websiteId}/sessions/${event.sessionId}`}
                      className="shrink-0 font-mono text-xs text-primary hover:underline"
                    >
                      {event.sessionId.slice(0, 8)}
                    </AppLink>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export function RealtimeView() {
  const website = useCurrentWebsite();
  const timezone = useTimezone();
  const { data, isPending } = useQuery({
    queryKey: ['realtime', website.id, timezone],
    queryFn: () => api.get<RealtimeData>(`/realtime/${website.id}`, { timezone }),
    refetchInterval: REALTIME_INTERVAL,
  });

  const series = useMemo(() => {
    if (!data) return [];

    const end = toZonedTime(new Date(data.timestamp), timezone);
    const start = subMinutes(end, REALTIME_RANGE);
    const visitors = generateTimeSeries(data.series.visitors, start, end, 'minute', 'en-US');
    const views = generateTimeSeries(data.series.views, start, end, 'minute', 'en-US');

    return visitors.map((point, index) => ({
      label: point.x.slice(11),
      visitors: point.y ?? 0,
      views: views[index]?.y ?? 0,
    }));
  }, [data, timezone]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          Realtime
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-online opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-status-online" />
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {website.name} · last {REALTIME_RANGE} minutes, updates every {REALTIME_INTERVAL / 1000} seconds
        </p>
      </div>

      <StatCards
        loading={isPending}
        stats={
          data && [
            { label: 'Visitors', value: data.totals.visitors, format: formatLongNumber },
            { label: 'Views', value: data.totals.views, format: formatLongNumber },
            { label: 'Events', value: data.totals.events, format: formatLongNumber },
            { label: 'Countries', value: data.totals.countries, format: formatLongNumber },
          ]
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Per minute</CardTitle>
          <CardDescription>Visitors and views</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
              <BarChart data={series} margin={{ left: 0, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={32} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width="auto" />
                <ChartTooltip cursor={{ fill: 'var(--muted)', opacity: 0.5 }} content={<ChartTooltipContent />} />
                <Bar dataKey="visitors" fill="var(--color-visitors)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="views" fill="var(--color-views)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {data && (
        <>
          <LiveLog websiteId={website.id} events={data.events} />
          <div className="grid gap-6 *:min-w-0 lg:grid-cols-3">
            <TopList title="Pages" rows={data.urls} type="path" />
            <TopList title="Referrers" rows={data.referrers} type="referrer" />
            <TopList title="Countries" rows={data.countries} type="country" />
          </div>
          <WorldMap
            websiteId={website.id}
            title="Visitors now"
            data={Object.entries(data.countries).map(([x, y]) => ({ x, y }))}
          />
        </>
      )}
    </div>
  );
}
