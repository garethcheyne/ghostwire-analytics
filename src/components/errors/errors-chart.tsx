'use client';
import { parse } from 'date-fns';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { SeriesPoint } from '@/hooks/queries/errors';
import { useDateRange } from '@/hooks/use-date-range';
import { DATE_FORMATS, generateTimeSeries } from '@/lib/date';

const config = {
  errors: { label: 'Errors', color: 'var(--destructive)' },
} satisfies ChartConfig;

const TICK_FORMAT: Record<string, Intl.DateTimeFormatOptions> = {
  minute: { hour: 'numeric', minute: '2-digit' },
  hour: { hour: 'numeric' },
  day: { day: 'numeric', month: 'short' },
  month: { month: 'short', year: 'numeric' },
  year: { year: 'numeric' },
};

/** Error occurrences per time bucket for the selected date range. */
export function ErrorsChart({ series, className }: { series: SeriesPoint[]; className?: string }) {
  const { startDate, endDate, unit } = useDateRange();
  const bucketFormat = DATE_FORMATS[unit as keyof typeof DATE_FORMATS] ?? DATE_FORMATS.day;

  const data = useMemo(
    () =>
      generateTimeSeries(series, startDate, endDate, unit, 'en-US').map(point => ({
        label: point.x,
        errors: point.y ?? 0,
      })),
    [series, startDate, endDate, unit],
  );

  const tickFormatter = (value: string) => {
    const date = parse(value, bucketFormat, new Date());
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-US', TICK_FORMAT[unit] ?? TICK_FORMAT.day);
  };

  return (
    <ChartContainer config={config} className={className ?? 'aspect-auto h-48 w-full'}>
      <BarChart data={data} margin={{ left: 0, right: 8 }}>
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
        <Bar dataKey="errors" fill="var(--color-errors)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}
