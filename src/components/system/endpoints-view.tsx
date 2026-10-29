'use client';
import { Waypoints } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { QueryError } from '@/components/query-error';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { type EndpointRow, useEndpointSeries, useEndpoints, useSystemServices } from '@/hooks/queries/system';
import { cn } from '@/lib/utils';
import { TimeChart, useFilledSeries } from './charts';
import { formatCount, formatMs, formatRate, formatRatio } from './format';
import { NoMonitoringData, SystemHeader } from './system-header';

const ZERO = ['requests', 'errors'];

function EndpointCharts({ websiteId, selected }: { websiteId: string; selected: EndpointRow | null }) {
  const { data, dataUpdatedAt } = useEndpointSeries(websiteId, selected);
  const series = useFilledSeries(data?.points, data?.bucketSeconds, dataUpdatedAt, ZERO);
  const bucket = data?.bucketSeconds ?? 60;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Latency</CardTitle>
          <CardDescription>{selected ? `${selected.method ?? ''} ${selected.route ?? '(no route)'}` : 'All endpoints'}</CardDescription>
        </CardHeader>
        <CardContent>
          {data ? (
            <TimeChart
              data={series}
              bucketSeconds={bucket}
              format={formatMs}
              series={[
                { key: 'p50', label: 'p50' },
                { key: 'p95', label: 'p95' },
                { key: 'p99', label: 'p99' },
              ]}
            />
          ) : (
            <Skeleton className="h-56 w-full" />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Requests</CardTitle>
          <CardDescription>Requests and server errors per interval</CardDescription>
        </CardHeader>
        <CardContent>
          {data ? (
            <TimeChart
              kind="bar"
              data={series}
              bucketSeconds={bucket}
              series={[
                { key: 'requests', label: 'Requests', color: 'var(--chart-1)' },
                { key: 'errors', label: 'Errors', color: 'var(--destructive)' },
              ]}
            />
          ) : (
            <Skeleton className="h-56 w-full" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function EndpointsView() {
  const website = useCurrentWebsite();
  const { data, isPending, error } = useEndpoints(website.id);
  const { data: services } = useSystemServices(website.id);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const names = useMemo(() => new Map(services?.map(s => [s.id, s.name]) ?? []), [services]);
  const key = (row: EndpointRow) => `${row.serviceId}|${row.method}|${row.route}`;
  const selected = data?.find(row => key(row) === selectedKey) ?? null;

  return (
    <div className="space-y-6">
      <SystemHeader
        icon={Waypoints}
        title="Endpoints"
        description="Requests per route: throughput, server errors and latency percentiles. Pick a row to chart it."
      />
      {error ? (
        <QueryError error={error} />
      ) : (
        <>
          <EndpointCharts websiteId={website.id} selected={selected} />
          <Card>
            <CardHeader>
              <CardTitle>Endpoints</CardTitle>
              <CardDescription>From the http.server.request.duration metric, busiest first</CardDescription>
              {selected && (
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => setSelectedKey(null)}>
                    Chart all endpoints
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              {isPending ? (
                <Skeleton className="h-64 w-full" />
              ) : !data?.length ? (
                <NoMonitoringData websiteId={website.id} what="request metrics" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Requests</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Rate</TableHead>
                      <TableHead className="text-right">Errors</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">p50</TableHead>
                      <TableHead className="text-right">p95</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">p99</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map(row => (
                      <TableRow
                        key={key(row)}
                        className={cn('cursor-pointer', key(row) === selectedKey && 'bg-muted/50')}
                        onClick={() => setSelectedKey(key(row) === selectedKey ? null : key(row))}
                      >
                        <TableCell className="max-w-0 w-full">
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-mono text-sm">
                              <span className="text-muted-foreground">{row.method ?? 'ANY'}</span>{' '}
                              {row.route ?? '(no route)'}
                            </span>
                            <span className="truncate text-xs text-muted-foreground">
                              {names.get(row.serviceId) ?? 'Unknown service'} ·{' '}
                              <Link
                                className="hover:underline"
                                onClick={event => event.stopPropagation()}
                                href={`/websites/${website.id}/system/traces?service=${row.serviceId}${row.route ? `&route=${encodeURIComponent(row.route)}` : ''}`}
                              >
                                Traces
                              </Link>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCount(row.count)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{formatRate(row.rate)}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums',
                            row.errorRate && row.errorRate > 0.05 && 'text-red-600 dark:text-red-400',
                          )}
                        >
                          {formatRatio(row.errorRate)}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMs(row.p50)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMs(row.p95)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMs(row.p99)}</TableCell>
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
