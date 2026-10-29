'use client';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { useDateRange } from '@/hooks/use-date-range';
import { formatBucket } from './format';

export const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

/**
 * Every bucket in the selected range, so quiet periods show as gaps or zeros instead of the line
 * jumping across them. `zero` lists the keys that mean "nothing happened" when missing.
 */
export function useFilledSeries<T extends { t: number }>(
  points: T[] | undefined,
  bucketSeconds: number | undefined,
  /** When the data was fetched (the query's dataUpdatedAt): buckets after it haven't happened. */
  now: number,
  zero: string[] = [],
) {
  const { params } = useDateRange();

  return useMemo(() => {
    if (!points || !bucketSeconds) return [];
    const step = bucketSeconds * 1000;
    const end = Math.min(params.endAt, now || params.endAt);
    const first = Math.floor(params.startAt / step) * step;
    const byT = new Map(points.map(p => [p.t, p]));
    const out: Record<string, number | null>[] = [];

    // Never more than a few hundred buckets (the server picks the size for the range).
    for (let t = first; t <= end && out.length < 2000; t += step) {
      const point = byT.get(t) as Record<string, unknown> | undefined;
      const row: Record<string, number | null> = { t };
      for (const key of zero) row[key] = 0;
      if (point) {
        for (const [key, value] of Object.entries(point)) {
          row[key] = typeof value === 'number' ? value : value === null ? null : row[key] ?? null;
        }
      }
      out.push(row);
    }
    return out;
  }, [points, bucketSeconds, params.startAt, params.endAt, now, zero]);
}

interface TimeChartProps {
  data: Record<string, number | null>[];
  bucketSeconds: number;
  series: { key: string; label: string; color?: string }[];
  format?: (value: number) => string;
  kind?: 'line' | 'bar';
  stacked?: boolean;
  className?: string;
}

/** A time series chart in the app's chart style, lines (latency, utilization) or bars (counts). */
export function TimeChart({ data, bucketSeconds, series, format, kind = 'line', stacked, className }: TimeChartProps) {
  const config = Object.fromEntries(
    series.map((s, i) => [s.key, { label: s.label, color: s.color ?? SERIES_COLORS[i % SERIES_COLORS.length] }]),
  ) satisfies ChartConfig;
  const tick = (value: number) => formatBucket(Number(value), bucketSeconds);
  const tooltip = (
    <ChartTooltipContent
      labelFormatter={(_, payload) => tick(Number(payload?.[0]?.payload?.t))}
      formatter={(value, name) => (
        <div className="flex w-full items-center justify-between gap-4">
          <span className="text-muted-foreground">{config[String(name)]?.label ?? name}</span>
          <span className="font-mono tabular-nums">
            {value === null || value === undefined ? '–' : format ? format(Number(value)) : String(value)}
          </span>
        </div>
      )}
    />
  );
  const axes = (
    <>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} tickFormatter={tick} />
      <YAxis
        tickLine={false}
        axisLine={false}
        width="auto"
        tickFormatter={value => (format ? format(Number(value)) : String(value))}
      />
      <ChartTooltip cursor={kind === 'bar' ? { fill: 'var(--muted)', opacity: 0.5 } : true} content={tooltip} />
      {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
    </>
  );

  return (
    <ChartContainer config={config} className={className ?? 'aspect-auto h-56 w-full'}>
      {kind === 'bar' ? (
        <BarChart data={data} margin={{ left: 0, right: 8 }}>
          {axes}
          {series.map(s => (
            <Bar
              key={s.key}
              dataKey={s.key}
              fill={`var(--color-${s.key})`}
              stackId={stacked ? 'a' : undefined}
              radius={stacked ? 0 : [3, 3, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      ) : (
        <LineChart data={data} margin={{ left: 0, right: 8 }}>
          {axes}
          {series.map(s => (
            <Line
              key={s.key}
              dataKey={s.key}
              stroke={`var(--color-${s.key})`}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      )}
    </ChartContainer>
  );
}
