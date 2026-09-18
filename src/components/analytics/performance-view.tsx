'use client';
import { parseISO } from 'date-fns';
import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useAnalyticsQuery } from '@/hooks/queries/analytics';
import { useDateRange } from '@/hooks/use-date-range';
import { WEB_VITALS_THRESHOLDS } from '@/lib/constants';
import { parseBackendDate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { WebsiteHeader } from './website-header';

type Metric = keyof typeof WEB_VITALS_THRESHOLDS;
type Percentile = 'p50' | 'p75' | 'p95';
type Percentiles = Record<Percentile, number>;

const METRICS: { id: Metric; name: string; description: string }[] = [
  { id: 'lcp', name: 'LCP', description: 'Largest Contentful Paint' },
  { id: 'inp', name: 'INP', description: 'Interaction to Next Paint' },
  { id: 'cls', name: 'CLS', description: 'Cumulative Layout Shift' },
  { id: 'fcp', name: 'FCP', description: 'First Contentful Paint' },
  { id: 'ttfb', name: 'TTFB', description: 'Time to First Byte' },
];

function formatValue(metric: Metric, value: number) {
  if (metric === 'cls') return value.toFixed(3);
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

function rating(metric: Metric, value: number) {
  const { good, poor } = WEB_VITALS_THRESHOLDS[metric];
  if (value <= good) return { label: 'Good', className: 'text-status-online' };
  if (value <= poor) return { label: 'Needs improvement', className: 'text-status-warning' };
  return { label: 'Poor', className: 'text-destructive' };
}

const chartConfig = {
  p50: { label: 'p50', color: 'var(--chart-3)' },
  p75: { label: 'p75', color: 'var(--chart-1)' },
  p95: { label: 'p95', color: 'var(--chart-5)' },
} satisfies ChartConfig;

export function PerformanceView() {
  const { id } = useCurrentWebsite();
  const { unit } = useDateRange();
  const [metric, setMetric] = useState<Metric>('lcp');
  const [percentile, setPercentile] = useState<Percentile>('p75');
  const [breakdown, setBreakdown] = useState('path');

  const stats = useAnalyticsQuery<Record<Metric, Percentiles> & { count: number }>(id, 'performance/stats');
  const chart = useAnalyticsQuery<{ chart: ({ t: string } & Percentiles)[] }>(id, 'performance/chart', { metric });
  const pages = useAnalyticsQuery<({ name: string | null; count: number } & Percentiles)[]>(
    id,
    'performance/metrics',
    { metric, type: breakdown },
  );

  const series = useMemo(
    () =>
      (chart.data?.chart ?? []).map(point => ({
        t: parseBackendDate(point.t).toISOString(),
        p50: Number(point.p50),
        p75: Number(point.p75),
        p95: Number(point.p95),
      })),
    [chart.data],
  );

  const thresholds = WEB_VITALS_THRESHOLDS[metric];
  const hasData = (stats.data?.count ?? 0) > 0;

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Performance" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Core Web Vitals from real visits{hasData ? ` (${stats.data!.count} samples)` : ''}. Click a
          metric to chart it.
        </p>
        <ToggleGroup
          type="single"
          variant="outline"
          value={percentile}
          onValueChange={value => value && setPercentile(value as Percentile)}
        >
          <ToggleGroupItem value="p50">p50</ToggleGroupItem>
          <ToggleGroupItem value="p75">p75</ToggleGroupItem>
          <ToggleGroupItem value="p95">p95</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {METRICS.map(({ id: key, name, description }) => {
          const value = Number(stats.data?.[key]?.[percentile] ?? 0);
          const rate = rating(key, value);

          return stats.isPending ? (
            <Skeleton key={key} className="h-28" />
          ) : (
            <button
              key={key}
              type="button"
              onClick={() => setMetric(key)}
              className={cn(
                'flex flex-col gap-1 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40',
                metric === key && 'border-primary ring-1 ring-primary',
              )}
            >
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{name}</span>
              <span className="text-2xl font-semibold tabular-nums">
                {hasData ? formatValue(key, value) : '–'}
              </span>
              <span className={cn('text-xs font-medium', hasData ? rate.className : 'text-muted-foreground')}>
                {hasData ? rate.label : 'No data'}
              </span>
              <span className="text-[11px] text-muted-foreground">{description}</span>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{METRICS.find(m => m.id === metric)?.description}</CardTitle>
          <CardDescription>
            Good under {formatValue(metric, thresholds.good)}, poor over {formatValue(metric, thresholds.poor)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chart.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
              <LineChart data={series} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="t"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={32}
                  tickFormatter={value =>
                    parseISO(value).toLocaleString('en-US', unit === 'hour' ? { hour: 'numeric' } : { day: 'numeric', month: 'short' })
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={value => formatValue(metric, Number(value))}
                />
                <ReferenceLine y={thresholds.good} stroke="var(--color-status-online)" strokeDasharray="4 4" />
                <ReferenceLine y={thresholds.poor} stroke="var(--destructive)" strokeDasharray="4 4" />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={label => parseISO(String(label)).toLocaleString()}
                      formatter={(value, name) => `${name}: ${formatValue(metric, Number(value))}`}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                {(['p50', 'p75', 'p95'] as const).map(key => (
                  <Line key={key} dataKey={key} stroke={`var(--color-${key})`} strokeWidth={2} dot={series.length < 3} />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Breakdown</CardTitle>
          <CardDescription>{METRICS.find(m => m.id === metric)?.name} by {breakdown === 'path' ? 'page' : breakdown}</CardDescription>
          <div className="pt-2">
            <ToggleGroup type="single" variant="outline" size="sm" value={breakdown} onValueChange={v => v && setBreakdown(v)}>
              <ToggleGroupItem value="path">Pages</ToggleGroupItem>
              <ToggleGroupItem value="title">Titles</ToggleGroupItem>
              <ToggleGroupItem value="device">Devices</ToggleGroupItem>
              <ToggleGroupItem value="browser">Browsers</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </CardHeader>
        <CardContent>
          {pages.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : !pages.data?.length ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{breakdown === 'path' ? 'Page' : breakdown[0].toUpperCase() + breakdown.slice(1)}</TableHead>
                  <TableHead className="text-right">p50</TableHead>
                  <TableHead className="text-right">p75</TableHead>
                  <TableHead className="text-right">p95</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.data.map(row => (
                  <TableRow key={row.name ?? '(unknown)'}>
                    <TableCell className="max-w-md truncate">{row.name ?? '(unknown)'}</TableCell>
                    {(['p50', 'p75', 'p95'] as const).map(key => (
                      <TableCell
                        key={key}
                        className={cn('text-right tabular-nums', rating(metric, Number(row[key])).className)}
                      >
                        {formatValue(metric, Number(row[key]))}
                      </TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums text-muted-foreground">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
