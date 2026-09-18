'use client';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useAnalyticsQuery } from '@/hooks/queries/analytics';
import { parseBackendDate } from '@/lib/date';
import { formatLongNumber } from '@/lib/format';

interface RetentionRow {
  date: string;
  day: number;
  visitors: number;
  returnVisitors: number;
  percentage: number;
}

const MAX_DAYS = 31;

/** Cohort grid: of the visitors first seen on a day, how many came back N days later. */
export function RetentionView() {
  const { id } = useCurrentWebsite();
  const { data, isPending } = useAnalyticsQuery<RetentionRow[]>(id, 'retention');

  const { cohorts, maxDay } = useMemo(() => {
    const byDate = new Map<string, { visitors: number; days: Map<number, RetentionRow> }>();

    for (const row of data ?? []) {
      if (!byDate.has(row.date)) byDate.set(row.date, { visitors: Number(row.visitors), days: new Map() });
      byDate.get(row.date)!.days.set(row.day, row);
    }

    const cohorts = [...byDate.entries()].map(([date, value]) => ({ date, ...value }));
    const maxDay = Math.min(MAX_DAYS, Math.max(0, ...(data ?? []).map(row => row.day)));

    return { cohorts, maxDay };
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Retention" />
      <Card>
        <CardHeader>
          <CardTitle>Retention</CardTitle>
          <CardDescription>
            Each row is the visitors first seen that day; each column the share who returned N days later.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {isPending ? (
            <Skeleton className="h-96 w-full" />
          ) : cohorts.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No data for this period.</p>
          ) : (
            <table className="w-full border-separate border-spacing-1 text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-2 text-left font-medium">Cohort</th>
                  <th className="px-2 text-right font-medium">Visitors</th>
                  {Array.from({ length: maxDay }, (_, i) => (
                    <th key={i} className="min-w-10 font-medium">
                      Day {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map(cohort => (
                  <tr key={cohort.date}>
                    <td className="px-2 whitespace-nowrap">{format(parseBackendDate(cohort.date), 'd MMM')}</td>
                    <td className="px-2 text-right tabular-nums">{formatLongNumber(cohort.visitors)}</td>
                    {Array.from({ length: maxDay }, (_, i) => {
                      const cell = cohort.days.get(i + 1);
                      const pct = cell ? Number(cell.percentage) : 0;

                      return (
                        <td key={i} className="p-0">
                          {cell ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  className="flex h-8 items-center justify-center rounded-sm tabular-nums"
                                  style={{
                                    backgroundColor: `color-mix(in oklab, var(--primary) ${Math.min(100, 15 + pct * 3)}%, var(--muted))`,
                                  }}
                                >
                                  {pct >= 1 ? `${Math.round(pct)}%` : '<1%'}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                {formatLongNumber(Number(cell.returnVisitors))} of {formatLongNumber(cohort.visitors)}{' '}
                                returned on day {i + 1}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <div className="h-8 rounded-sm bg-muted/40" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
