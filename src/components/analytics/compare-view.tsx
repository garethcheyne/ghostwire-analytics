'use client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import type { MetricRow } from '@/hooks/queries/analytics';
import { useDateRange } from '@/hooks/use-date-range';
import { useFilters } from '@/hooks/use-filters';
import { api } from '@/lib/api-client';
import { getCompareDate } from '@/lib/date';
import { formatLongNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { COMPARE_TYPES } from './fields';
import { formatMetricLabel } from './metric-labels';
import { StatsBar } from './stats-bar';
import { WebsiteHeader } from './website-header';

function useMetricsFor(websiteId: string, type: string, startAt: number, endAt: number) {
  const { params: dateParams } = useDateRange();
  const { params: filterParams } = useFilters();
  const params = { ...dateParams, ...filterParams, startAt, endAt, type, limit: 50 };

  return useQuery({
    queryKey: ['analytics', websiteId, 'compare-metrics', params],
    queryFn: () => api.get<MetricRow[]>(`/websites/${websiteId}/metrics`, params),
  });
}

export function CompareView() {
  const { id } = useCurrentWebsite();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { params, compare, startDate, endDate } = useDateRange();
  const [type, setType] = useState('path');

  // The comparison window, shifted from the real (UTC) range.
  const previous = useMemo(() => {
    const range = getCompareDate(compare, new Date(params.startAt), new Date(params.endAt));
    return { startAt: +range.startDate!, endAt: +range.endDate! };
  }, [compare, params.startAt, params.endAt]);

  const current = useMetricsFor(id, type, params.startAt, params.endAt);
  const prior = useMetricsFor(id, type, previous.startAt, previous.endAt);

  const rows = useMemo(() => {
    const before = new Map((prior.data ?? []).map(row => [row.x, Number(row.y)]));
    return (current.data ?? []).map(row => ({
      x: row.x,
      now: Number(row.y),
      before: before.get(row.x) ?? 0,
    }));
  }, [current.data, prior.data]);

  const setCompare = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('compare', value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const period = (start: Date | number, end: Date | number) =>
    `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Compare" />

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup type="single" variant="outline" value={compare} onValueChange={v => v && setCompare(v)}>
          <ToggleGroupItem value="prev">Previous period</ToggleGroupItem>
          <ToggleGroupItem value="yoy">Year over year</ToggleGroupItem>
        </ToggleGroup>
        <span className="text-sm text-muted-foreground">
          {period(startDate, endDate)} vs {period(previous.startAt, previous.endAt)}
        </span>
      </div>

      <StatsBar websiteId={id} />

      <Card>
        <CardHeader>
          <CardTitle>By dimension</CardTitle>
          <CardDescription>Visitors this period against the comparison period.</CardDescription>
          <div className="pt-2">
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {COMPARE_TYPES.map(option => (
                    <SelectItem key={option.type} value={option.type}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {current.isPending || prior.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{COMPARE_TYPES.find(t => t.type === type)?.label}</TableHead>
                  <TableHead className="text-right">This period</TableHead>
                  <TableHead className="text-right">Previous</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => {
                  const change = row.before ? ((row.now - row.before) / row.before) * 100 : null;
                  const Icon = change !== null && change < 0 ? ArrowDownRight : ArrowUpRight;

                  return (
                    <TableRow key={`${row.x}`}>
                      <TableCell className="max-w-md truncate">{formatMetricLabel(type, row.x)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatLongNumber(row.now)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatLongNumber(row.before)}
                      </TableCell>
                      <TableCell className="text-right">
                        {change === null ? (
                          <span className="text-xs text-muted-foreground">New</span>
                        ) : Math.round(change) === 0 ? (
                          <span className="text-xs text-muted-foreground">–</span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex items-center gap-0.5 text-xs font-medium tabular-nums',
                              change > 0 ? 'text-status-online' : 'text-destructive',
                            )}
                          >
                            <Icon className="size-3.5" />
                            {Math.abs(Math.round(change))}%
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
