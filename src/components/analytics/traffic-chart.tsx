'use client';
import { parse } from 'date-fns';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useWebsitePageviews } from '@/hooks/queries/analytics';
import { useDateRange } from '@/hooks/use-date-range';
import { DATE_FORMATS, generateTimeSeries } from '@/lib/date';

const config = {
  visitors: { label: 'Visitors', color: 'var(--chart-1)' },
  views: { label: 'Views', color: 'var(--chart-2)' },
} satisfies ChartConfig;

// Axis labels per bucket size; generateTimeSeries keys buckets with Umami's DATE_FORMATS.
const TICK_FORMAT: Record<string, Intl.DateTimeFormatOptions> = {
  minute: { hour: 'numeric', minute: '2-digit' },
  hour: { hour: 'numeric' },
  day: { day: 'numeric', month: 'short' },
  month: { month: 'short', year: 'numeric' },
  year: { year: 'numeric' },
};

export function TrafficChart({ websiteId }: { websiteId: string }) {
  const { startDate, endDate, unit } = useDateRange();
  const { data, isPending } = useWebsitePageviews(websiteId);

  const series = useMemo(() => {
    if (!data) return [];

    const visitors = generateTimeSeries(data.sessions, startDate, endDate, unit, 'en-US');
    const views = generateTimeSeries(data.pageviews, startDate, endDate, unit, 'en-US');

    return visitors.map((point, index) => ({
      label: point.x,
      visitors: point.y ?? 0,
      views: views[index]?.y ?? 0,
    }));
  }, [data, startDate, endDate, unit]);

  const tickFormatter = (value: string) => {
    const date = parse(value, DATE_FORMATS[unit as keyof typeof DATE_FORMATS] ?? DATE_FORMATS.day, new Date());
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-US', TICK_FORMAT[unit] ?? TICK_FORMAT.day);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traffic</CardTitle>
        <CardDescription>Visitors and page views per {unit}</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-72 w-full">
            <BarChart data={series} margin={{ left: -16, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={tickFormatter}
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={48} />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                content={<ChartTooltipContent labelFormatter={label => tickFormatter(String(label))} />}
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="visitors" fill="var(--color-visitors)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="views" fill="var(--color-views)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
