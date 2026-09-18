'use client';
import { parse } from 'date-fns';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useEventSeries } from '@/hooks/queries/analytics';
import { useDateRange } from '@/hooks/use-date-range';
import { DATE_FORMATS, generateTimeSeries } from '@/lib/date';

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const TICK_FORMAT: Record<string, Intl.DateTimeFormatOptions> = {
  minute: { hour: 'numeric', minute: '2-digit' },
  hour: { hour: 'numeric' },
  day: { day: 'numeric', month: 'short' },
  month: { month: 'short', year: 'numeric' },
  year: { year: 'numeric' },
};

/** Event counts per time bucket, stacked by event name. */
export function EventsChart({ websiteId, limit = 10 }: { websiteId: string; limit?: number }) {
  const { startDate, endDate, unit } = useDateRange();
  const { data, isPending } = useEventSeries(websiteId, limit);

  const { rows, config, keys } = useMemo(() => {
    const byEvent = new Map<string, { x: string; y: number }[]>();

    for (const { x, t, y } of data ?? []) {
      if (!byEvent.has(x)) byEvent.set(x, []);
      byEvent.get(x)!.push({ x: t, y: Number(y) });
    }

    const keys = [...byEvent.keys()];
    // Chart keys must be safe identifiers for CSS variables.
    const safeKey = (index: number) => `event${index}`;
    const config: ChartConfig = Object.fromEntries(
      keys.map((name, index) => [safeKey(index), { label: name, color: COLORS[index % COLORS.length] }]),
    );

    const series = keys.map(name =>
      generateTimeSeries(byEvent.get(name)!, startDate, endDate, unit, 'en-US'),
    );
    const buckets = generateTimeSeries([], startDate, endDate, unit, 'en-US');
    const rows = buckets.map((bucket, i) => ({
      label: bucket.x,
      ...Object.fromEntries(keys.map((_, k) => [safeKey(k), series[k][i]?.y ?? 0])),
    }));

    return { rows, config, keys: keys.map((_, index) => safeKey(index)) };
  }, [data, startDate, endDate, unit]);

  const tickFormatter = (value: string) => {
    const date = parse(value, DATE_FORMATS[unit as keyof typeof DATE_FORMATS] ?? DATE_FORMATS.day, new Date());
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-US', TICK_FORMAT[unit] ?? TICK_FORMAT.day);
  };

  if (isPending) {
    return <Skeleton className="h-72 w-full" />;
  }

  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={rows} margin={{ left: 0, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={tickFormatter}
        />
        <YAxis tickLine={false} axisLine={false} allowDecimals={false} width="auto" />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
          content={<ChartTooltipContent labelFormatter={label => tickFormatter(String(label))} />}
        />
        {keys.length > 0 && <ChartLegend content={<ChartLegendContent />} />}
        {keys.map((key, index) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="events"
            fill={`var(--color-${key})`}
            radius={index === keys.length - 1 ? [3, 3, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
