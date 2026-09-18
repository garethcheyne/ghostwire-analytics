'use client';
import { parse } from 'date-fns';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { BarList } from '@/components/analytics/bar-list';
import { formatMetricLabel } from '@/components/analytics/metric-labels';
import { StatCards } from '@/components/analytics/stat-cards';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useAnalyticsQuery } from '@/hooks/queries/analytics';
import { useDateRange } from '@/hooks/use-date-range';
import { DATE_FORMATS, generateTimeSeries } from '@/lib/date';
import { formatLongNumber } from '@/lib/format';
import { CurrencySelect, formatCurrency } from './currency-select';

interface RevenueStats {
  sum: number | string;
  count: number;
  unique_count: number;
  total_sessions: number;
  average: number;
  arpu: number;
}

const chartConfig = { revenue: { label: 'Revenue', color: 'var(--chart-3)' } } satisfies ChartConfig;

function RevenueBreakdown({ websiteId, currency }: { websiteId: string; currency: string }) {
  const [type, setType] = useState('country');
  const { data, isPending } = useAnalyticsQuery<{ name: string | null; value: string }[]>(
    websiteId,
    'revenue/metrics',
    { type, currency },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue by</CardTitle>
        <CardAction>
          <Tabs value={type} onValueChange={setType}>
            <TabsList>
              <TabsTrigger value="country" className="text-xs">Country</TabsTrigger>
              <TabsTrigger value="region" className="text-xs">Region</TabsTrigger>
              <TabsTrigger value="referrer" className="text-xs">Referrer</TabsTrigger>
              <TabsTrigger value="channel" className="text-xs">Channel</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <BarList
            rows={(data ?? []).slice(0, 15).map(row => ({
              key: row.name ?? '(none)',
              label: formatMetricLabel(type, row.name),
              value: Number(row.value),
            }))}
            format={value => formatCurrency(value, currency)}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function RevenueView() {
  const { id } = useCurrentWebsite();
  const { startDate, endDate, unit } = useDateRange();
  const [currency, setCurrency] = useState('USD');
  const stats = useAnalyticsQuery<RevenueStats & { comparison: RevenueStats }>(id, 'revenue/stats', { currency });
  const chart = useAnalyticsQuery<{ chart: { x: string; t: string; y: string; count: number }[] }>(
    id,
    'revenue/chart',
    { currency },
  );

  const series = useMemo(() => {
    const totals = new Map<string, number>();
    for (const point of chart.data?.chart ?? []) {
      totals.set(point.t, (totals.get(point.t) ?? 0) + Number(point.y));
    }
    return generateTimeSeries(
      [...totals.entries()].map(([x, y]) => ({ x, y })),
      startDate,
      endDate,
      unit,
      'en-US',
    ).map(point => ({ label: point.x, revenue: point.y ?? 0 }));
  }, [chart.data, startDate, endDate, unit]);

  const s = stats.data;
  const money = (value: number) => formatCurrency(value, currency);

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Revenue" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          From events sent with <code className="font-mono text-xs">revenue</code> and{' '}
          <code className="font-mono text-xs">currency</code> properties.
        </p>
        <CurrencySelect value={currency} onChange={setCurrency} />
      </div>

      <StatCards
        loading={!s}
        stats={
          s && [
            { label: 'Revenue', value: Number(s.sum), previous: Number(s.comparison.sum), format: money },
            { label: 'Orders', value: Number(s.count), previous: Number(s.comparison.count), format: formatLongNumber },
            {
              label: 'Customers',
              value: Number(s.unique_count),
              previous: Number(s.comparison.unique_count),
              format: formatLongNumber,
            },
            { label: 'Avg order', value: Number(s.average), previous: Number(s.comparison.average), format: money },
            { label: 'Per visitor', value: Number(s.arpu), previous: Number(s.comparison.arpu), format: money },
          ]
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Revenue over time</CardTitle>
          <CardDescription>Per {unit}</CardDescription>
        </CardHeader>
        <CardContent>
          {chart.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-64 w-full">
              <BarChart data={series} margin={{ left: 8, right: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  tickFormatter={value => {
                    const date = parse(value, DATE_FORMATS[unit as keyof typeof DATE_FORMATS] ?? DATE_FORMATS.day, new Date());
                    return Number.isNaN(date.getTime())
                      ? value
                      : date.toLocaleString('en-US', unit === 'hour' ? { hour: 'numeric' } : { day: 'numeric', month: 'short' });
                  }}
                />
                <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={value => money(Number(value))} />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                  content={<ChartTooltipContent formatter={value => money(Number(value))} />}
                />
                <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <RevenueBreakdown websiteId={id} currency={currency} />
    </div>
  );
}
