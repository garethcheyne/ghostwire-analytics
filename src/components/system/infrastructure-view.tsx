'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Container } from 'lucide-react';
import { useMemo } from 'react';
import { QueryError } from '@/components/query-error';
import { StatCard } from '@/components/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { type Infrastructure, useInfrastructure } from '@/hooks/queries/system';
import { cn } from '@/lib/utils';
import { SERIES_COLORS, TimeChart, useFilledSeries } from './charts';
import { formatBytes, formatDuration, formatPercent } from './format';
import { NoMonitoringData, SystemHeader } from './system-header';

/** A container seen in the last few minutes is running; older ones have stopped reporting. */
const RUNNING_WITHIN_MS = 3 * 60 * 1000;
const MAX_CHART_SERIES = 8;

function usePerEntitySeries(
  data: Infrastructure | undefined,
  kind: 'containers' | 'hosts',
  field: 'cpu' | 'memory',
  names: string[],
  now: number,
) {
  // Chart keys must be CSS-safe: s0, s1... with the names as labels.
  const points = useMemo(
    () =>
      data?.series.points.map(p => {
        const row: Record<string, number | null> & { t: number } = { t: p.t };
        names.forEach((name, i) => {
          const entity = (p[kind] as Record<string, Record<string, number | null>>)[name];
          row[`s${i}`] = entity?.[field] ?? null;
        });
        return row;
      }),
    [data, kind, field, names],
  );
  return {
    data: useFilledSeries(points, data?.series.bucketSeconds, now),
    series: names.map((name, i) => ({ key: `s${i}`, label: name, color: SERIES_COLORS[i % SERIES_COLORS.length] })),
  };
}

function Meter({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">–</span>;
  return (
    <div className="flex items-center justify-end gap-2">
      <Progress value={Math.min(value, 100)} className="hidden h-1.5 w-16 sm:block" />
      <span className={cn('tabular-nums', value >= 90 && 'text-red-600 dark:text-red-400')}>{formatPercent(value)}</span>
    </div>
  );
}

export function InfrastructureView() {
  const website = useCurrentWebsite();
  const { data, isPending, error, dataUpdatedAt: now } = useInfrastructure(website.id);

  const containerNames = useMemo(
    () =>
      [...(data?.containers ?? [])]
        .sort((a, b) => (b.cpuPercent ?? 0) - (a.cpuPercent ?? 0))
        .slice(0, MAX_CHART_SERIES)
        .map(c => c.name),
    [data],
  );
  const hostNames = useMemo(() => (data?.hosts ?? []).slice(0, MAX_CHART_SERIES).map(h => h.name), [data]);
  const cpu = usePerEntitySeries(data, 'containers', 'cpu', containerNames, now);
  const memory = usePerEntitySeries(data, 'containers', 'memory', containerNames, now);
  const hostCpu = usePerEntitySeries(data, 'hosts', 'cpu', hostNames, now);
  const hostMemory = usePerEntitySeries(data, 'hosts', 'memory', hostNames, now);
  const bucket = data?.series.bucketSeconds ?? 60;

  return (
    <div className="space-y-6">
      <SystemHeader
        icon={Container}
        title="Infrastructure"
        description="Containers and hosts, from each stack's OpenTelemetry Collector (docker_stats and host metrics)."
      />
      {error ? (
        <QueryError error={error} />
      ) : isPending || !data ? (
        <Skeleton className="h-96 w-full" />
      ) : !data.containers.length && !data.hosts.length ? (
        <NoMonitoringData websiteId={website.id} what="container or host metrics" />
      ) : (
        <>
          {data.hosts.map(host => (
            <div key={host.name} className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-muted-foreground">Host {host.name}</h2>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard
                  title="CPU"
                  value={formatPercent(host.cpuPercent)}
                  tone={host.cpuPercent !== null && host.cpuPercent >= 90 ? 'danger' : 'default'}
                  description={
                    host.load1 !== null
                      ? `Load ${host.load1.toFixed(2)} · ${host.load5?.toFixed(2) ?? '–'} · ${host.load15?.toFixed(2) ?? '–'}`
                      : undefined
                  }
                />
                <StatCard
                  title="Memory"
                  value={formatPercent(host.memoryPercent)}
                  tone={host.memoryPercent !== null && host.memoryPercent >= 90 ? 'danger' : 'default'}
                  description={
                    host.memoryUsedBytes !== null
                      ? `${formatBytes(host.memoryUsedBytes)} of ${formatBytes(host.memoryTotalBytes)}`
                      : undefined
                  }
                />
                <StatCard
                  title="Fullest disk"
                  value={formatPercent(Math.max(...host.disks.map(d => d.usedPercent ?? 0), 0) || null)}
                  description={`${host.disks.length} file systems`}
                />
                <StatCard
                  title="Network"
                  value={formatBytes(host.networkRxBytes + host.networkTxBytes)}
                  description={`${formatBytes(host.networkRxBytes)} in · ${formatBytes(host.networkTxBytes)} out`}
                />
              </div>
            </div>
          ))}

          {!!data.hosts.length && (
            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Host CPU</CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeChart data={hostCpu.data} bucketSeconds={bucket} series={hostCpu.series} format={v => formatPercent(v, 0)} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Host memory</CardTitle>
                </CardHeader>
                <CardContent>
                  <TimeChart
                    data={hostMemory.data}
                    bucketSeconds={bucket}
                    series={hostMemory.series}
                    format={v => formatPercent(v, 0)}
                  />
                </CardContent>
              </Card>
            </div>
          )}

          {!!data.containers.length && (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Container CPU</CardTitle>
                    <CardDescription>100 % is one full core; the busiest {containerNames.length} shown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TimeChart data={cpu.data} bucketSeconds={bucket} series={cpu.series} format={v => formatPercent(v, 0)} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Container memory</CardTitle>
                    <CardDescription>Memory in use</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <TimeChart data={memory.data} bucketSeconds={bucket} series={memory.series} format={formatBytes} />
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Containers</CardTitle>
                  <CardDescription>CPU is the average over the period; memory the latest reading</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Container</TableHead>
                        <TableHead className="text-right">CPU</TableHead>
                        <TableHead className="text-right">Memory</TableHead>
                        <TableHead className="hidden text-right md:table-cell">Network in / out</TableHead>
                        <TableHead className="hidden text-right lg:table-cell">Restarts</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">Uptime</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.containers.map(c => {
                        const running = now - c.lastSeen < RUNNING_WITHIN_MS;
                        return (
                          <TableRow key={c.name}>
                            <TableCell className="max-w-0 w-full">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="truncate font-mono text-sm">{c.name}</span>
                                {!running && (
                                  <Badge variant="outline" className="font-normal text-muted-foreground" title="No metrics recently">
                                    stopped {formatDistanceToNowStrict(new Date(c.lastSeen), { addSuffix: true })}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Meter value={c.cpuPercent} />
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap tabular-nums">
                              {formatBytes(c.memoryBytes)}
                              {c.memoryPercent !== null && (
                                <span className="ml-1 text-xs text-muted-foreground">{formatPercent(c.memoryPercent, 0)}</span>
                              )}
                            </TableCell>
                            <TableCell className="hidden text-right whitespace-nowrap tabular-nums md:table-cell">
                              {formatBytes(c.networkRxBytes)} / {formatBytes(c.networkTxBytes)}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'hidden text-right tabular-nums lg:table-cell',
                                c.restarts > 0 && 'text-amber-700 dark:text-amber-400',
                              )}
                            >
                              {c.restarts}
                            </TableCell>
                            <TableCell className="hidden text-right tabular-nums sm:table-cell">
                              {formatDuration(c.uptimeSeconds)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}

          {data.hosts.some(h => h.disks.length) && (
            <Card>
              <CardHeader>
                <CardTitle>Disks</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mount point</TableHead>
                      <TableHead className="text-right">Used</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">Free</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.hosts.flatMap(h =>
                      h.disks.map(d => (
                        <TableRow key={`${h.name}|${d.mountpoint}`}>
                          <TableCell className="font-mono text-sm">
                            {data.hosts.length > 1 && <span className="text-muted-foreground">{h.name} </span>}
                            {d.mountpoint}
                          </TableCell>
                          <TableCell className="text-right">
                            <Meter value={d.usedPercent} />
                          </TableCell>
                          <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatBytes(d.freeBytes)}</TableCell>
                        </TableRow>
                      )),
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
