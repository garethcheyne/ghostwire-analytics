'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Activity, Cpu, Gauge, MemoryStick, ServerCrash, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { QueryError } from '@/components/query-error';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useSystemOverview } from '@/hooks/queries/system';
import { TimeChart, useFilledSeries } from './charts';
import { formatBytes, formatMs, formatPercent, formatRate, formatRatio } from './format';
import { NoMonitoringData, StatusBadge, SystemHeader } from './system-header';

const KIND_LABEL = { app: 'Service', container: 'Container', host: 'Host', collector: 'Collector' } as const;
const REQUEST_ZERO = ['requests', 'errors'];

export function SystemOverviewView() {
  const website = useCurrentWebsite();
  const { data, isPending, error, dataUpdatedAt } = useSystemOverview(website.id);
  const series = useFilledSeries(data?.series.points, data?.series.bucketSeconds, dataUpdatedAt, REQUEST_ZERO);

  const down = data?.services.filter(s => s.status === 'down') ?? [];
  const totals = data?.totals;

  return (
    <div className="space-y-6">
      <SystemHeader
        icon={Activity}
        title="System"
        description="How each service is running: status, requests, errors and latency. Alerts are under Settings → Alerts."
      />

      {error ? (
        <QueryError error={error} />
      ) : isPending || !data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : !data.services.length ? (
        <NoMonitoringData websiteId={website.id} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard
              title="Services down"
              icon={ServerCrash}
              value={`${down.length} of ${data.services.length}`}
              tone={down.length ? 'danger' : 'success'}
              description={down.length ? down.map(s => s.name).join(', ') : 'Everything is reporting'}
            />
            <StatCard
              title="Requests"
              icon={Activity}
              value={formatRate(totals?.rate)}
              description={totals ? `${totals.count.toLocaleString()} in this period` : 'No request metrics'}
            />
            <StatCard
              title="Error rate"
              icon={TriangleAlert}
              value={formatRatio(totals?.errorRate)}
              tone={totals?.errorRate && totals.errorRate > 0.05 ? 'danger' : 'default'}
              description={totals ? `${totals.errors.toLocaleString()} server errors` : undefined}
            />
            <StatCard
              title="p95 latency"
              icon={Gauge}
              value={formatMs(totals?.p95)}
              description={totals ? `p50 ${formatMs(totals.p50)} · p99 ${formatMs(totals.p99)}` : undefined}
            />
            <StatCard
              title="Host CPU / memory"
              icon={data.resources.hosts ? Cpu : MemoryStick}
              value={
                data.resources.hosts
                  ? `${formatPercent(data.resources.hostCpuPercent, 0)} / ${formatPercent(data.resources.hostMemoryPercent, 0)}`
                  : '–'
              }
              description={
                data.resources.containers
                  ? `${data.resources.containers} containers using ${formatBytes(data.resources.containerMemoryBytes)}`
                  : 'No Collector data'
              }
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Requests</CardTitle>
                <CardDescription>Requests and server errors per interval</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeChart
                  kind="bar"
                  data={series}
                  bucketSeconds={data.series.bucketSeconds}
                  series={[
                    { key: 'requests', label: 'Requests', color: 'var(--chart-1)' },
                    { key: 'errors', label: 'Errors', color: 'var(--destructive)' },
                  ]}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Latency</CardTitle>
                <CardDescription>Request duration percentiles</CardDescription>
              </CardHeader>
              <CardContent>
                <TimeChart
                  data={series}
                  bucketSeconds={data.series.bucketSeconds}
                  format={formatMs}
                  series={[
                    { key: 'p50', label: 'p50' },
                    { key: 'p95', label: 'p95' },
                    { key: 'p99', label: 'p99' },
                  ]}
                />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
              <CardDescription>
                A service is down when it stops reporting for three of its usual intervals, or its heartbeat stops.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Version</TableHead>
                    <TableHead className="text-right">Requests</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead className="text-right">p95</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Last seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.services.map(service => (
                    <TableRow key={service.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col">
                          <Link
                            href={`/websites/${website.id}/system/endpoints?service=${service.id}`}
                            className="truncate font-medium hover:underline"
                          >
                            {service.name}
                          </Link>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {service.namespace || 'No namespace'}
                            {service.kind !== 'app' && (
                              <Badge variant="outline" className="font-normal">
                                {KIND_LABEL[service.kind]}
                              </Badge>
                            )}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={service.status} reason={service.statusReason} />
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">
                        {service.version ?? '–'}
                        {service.environment && (
                          <span className="ml-2 text-muted-foreground">{service.environment}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatRate(service.requests?.rate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatRatio(service.requests?.errorRate)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMs(service.requests?.p95)}</TableCell>
                      <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground lg:table-cell">
                        {formatDistanceToNowStrict(new Date(service.lastSeen), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
