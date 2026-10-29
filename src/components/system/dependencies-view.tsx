'use client';
import { Database } from 'lucide-react';
import { QueryError } from '@/components/query-error';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useDependencies } from '@/hooks/queries/system';
import { cn } from '@/lib/utils';
import { TimeChart, useFilledSeries } from './charts';
import { formatCount, formatMs, formatRate, formatRatio } from './format';
import { NoMonitoringData, SystemHeader } from './system-header';

const ZERO = ['calls', 'errors'];

export function DependenciesView() {
  const website = useCurrentWebsite();
  const { data, isPending, error, dataUpdatedAt } = useDependencies(website.id);
  const series = useFilledSeries(data?.series.points, data?.series.bucketSeconds, dataUpdatedAt, ZERO);
  const bucket = data?.series.bucketSeconds ?? 60;

  return (
    <div className="space-y-6">
      <SystemHeader
        icon={Database}
        title="Dependencies"
        description="Database, cache, search and HTTP calls the services make: how often, how slow, how often they fail."
      />
      {error ? (
        <QueryError error={error} />
      ) : isPending || !data ? (
        <Skeleton className="h-96 w-full" />
      ) : !data.dependencies.length ? (
        <NoMonitoringData websiteId={website.id} what="outside calls in this period" />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Calls</CardTitle>
                <CardDescription>Outside calls and failures per interval (traced calls)</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeChart
                  kind="bar"
                  data={series}
                  bucketSeconds={bucket}
                  series={[
                    { key: 'calls', label: 'Calls', color: 'var(--chart-2)' },
                    { key: 'errors', label: 'Failed', color: 'var(--destructive)' },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Latency</CardTitle>
                <CardDescription>p95 of outside calls</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeChart data={series} bucketSeconds={bucket} format={formatMs} series={[{ key: 'p95', label: 'p95' }]} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Dependencies</CardTitle>
              <CardDescription>
                By system and address. Counts come from the client duration metrics where a service sends them,
                otherwise from traced calls (lower when trace sampling is under 100 %).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dependency</TableHead>
                    <TableHead className="text-right">Calls</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Rate</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Average</TableHead>
                    <TableHead className="text-right">p95</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Slowest</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dependencies.map(row => (
                    <TableRow key={`${row.system}|${row.peer}`}>
                      <TableCell className="max-w-0 w-full">
                        <div className="flex min-w-0 items-center gap-2">
                          <Badge variant="outline" className="font-normal">
                            {row.system}
                          </Badge>
                          <span className="truncate font-mono text-sm">{row.peer || '(no address)'}</span>
                          {row.source === 'metrics' && (
                            <span className="hidden text-xs text-muted-foreground xl:inline">metrics</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCount(row.calls)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{formatRate(row.rate)}</TableCell>
                      <TableCell
                        className={cn('text-right tabular-nums', row.errors > 0 && 'text-red-600 dark:text-red-400')}
                      >
                        {formatRatio(row.errorRate)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMs(row.avg)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMs(row.p95)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">{formatMs(row.max)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Slowest statements</CardTitle>
              <CardDescription>Queries by average time, with their values replaced by ?</CardDescription>
            </CardHeader>
            <CardContent>
              {!data.statements.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No database statements in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statement</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Average</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">p95</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Slowest</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.statements.map(row => (
                      <TableRow key={`${row.system}|${row.statement}`}>
                        <TableCell className="max-w-0 w-full">
                          <div className="flex min-w-0 flex-col gap-1">
                            <code className="truncate font-mono text-xs" title={row.statement}>
                              {row.statement}
                            </code>
                            <span className="text-xs text-muted-foreground">
                              {row.system}
                              {row.errors > 0 && (
                                <span className="text-red-600 dark:text-red-400"> · {row.errors} failed</span>
                              )}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCount(row.calls)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMs(row.avg)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMs(row.p95)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMs(row.max)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
