'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Timer } from 'lucide-react';
import { useMemo } from 'react';
import { QueryError } from '@/components/query-error';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useJobs, useSystemServices } from '@/hooks/queries/system';
import { cn } from '@/lib/utils';
import { TimeChart, useFilledSeries } from './charts';
import { formatCount, formatMs, formatRatio } from './format';
import { NoMonitoringData, serviceLabel, StatusBadge, SystemHeader } from './system-header';

const ZERO = ['runs', 'failures'];
const ago = (value: string | number | null) =>
  value === null ? '–' : formatDistanceToNowStrict(new Date(value), { addSuffix: true });

export function JobsView() {
  const website = useCurrentWebsite();
  const { data, isPending, error, dataUpdatedAt } = useJobs(website.id);
  const { data: services } = useSystemServices(website.id);
  const series = useFilledSeries(data?.series.points, data?.series.bucketSeconds, dataUpdatedAt, ZERO);
  const names = useMemo(() => new Map(services?.map(s => [s.id, s.name]) ?? []), [services]);
  const workers = services?.filter(s => s.lastHeartbeatAt) ?? [];

  return (
    <div className="space-y-6">
      <SystemHeader
        icon={Timer}
        title="Jobs and workers"
        description="Background job runs, failures and durations, and whether each worker's heartbeat is still going."
      />
      {error ? (
        <QueryError error={error} />
      ) : isPending || !data ? (
        <Skeleton className="h-96 w-full" />
      ) : !data.jobs.length && !workers.length ? (
        <NoMonitoringData websiteId={website.id} what="job runs or heartbeats" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Runs</CardTitle>
              <CardDescription>Job runs and failures per interval</CardDescription>
            </CardHeader>
            <CardContent>
              <TimeChart
                kind="bar"
                stacked
                data={series.map(p => ({ ...p, ok: (p.runs ?? 0) - (p.failures ?? 0) }))}
                bucketSeconds={data.series.bucketSeconds}
                series={[
                  { key: 'ok', label: 'Succeeded', color: 'var(--chart-3)' },
                  { key: 'failures', label: 'Failed', color: 'var(--destructive)' },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Jobs</CardTitle>
              <CardDescription>From ghostwire.job.runs and ghostwire.job.duration</CardDescription>
            </CardHeader>
            <CardContent>
              {!data.jobs.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No job runs in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead className="text-right">Runs</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Average</TableHead>
                      <TableHead className="hidden text-right md:table-cell">p95</TableHead>
                      <TableHead className="text-right">Last run</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.jobs.map(job => (
                      <TableRow key={`${job.serviceId}|${job.job}`}>
                        <TableCell className="max-w-0 w-full">
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{job.job}</span>
                            <span className="truncate text-xs text-muted-foreground">
                              {names.get(job.serviceId) ?? 'Unknown service'}
                            </span>
                            {job.lastFailure && (
                              <span className="truncate text-xs text-red-600 dark:text-red-400" title={job.lastFailure}>
                                Last failure {ago(job.lastFailureAt)}: {job.lastFailure}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCount(job.runs)}</TableCell>
                        <TableCell
                          className={cn('text-right tabular-nums', job.failures > 0 && 'text-red-600 dark:text-red-400')}
                        >
                          {job.failures ? `${formatCount(job.failures)} (${formatRatio(job.failureRate)})` : '0'}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMs(job.avg)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{formatMs(job.p95)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap text-muted-foreground">{ago(job.lastRunAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Workers</CardTitle>
              <CardDescription>Services that send ghostwire.heartbeat; down when the heartbeat stops</CardDescription>
            </CardHeader>
            <CardContent>
              {!workers.length ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No worker heartbeats yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Worker</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Last heartbeat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workers.map(worker => (
                      <TableRow key={worker.id}>
                        <TableCell className="font-medium">{serviceLabel(worker)}</TableCell>
                        <TableCell>
                          <StatusBadge status={worker.status} reason={worker.statusReason} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                          {ago(worker.lastHeartbeatAt)}
                        </TableCell>
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
