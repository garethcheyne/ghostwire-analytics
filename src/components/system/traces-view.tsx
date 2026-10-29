'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { ChartGantt, Search } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { QueryError } from '@/components/query-error';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { type TraceFilters, useTraces } from '@/hooks/queries/system';
import { cn } from '@/lib/utils';
import { formatMs } from './format';
import { NoMonitoringData, SystemHeader } from './system-header';

const DURATIONS = [
  { value: '0', label: 'Any duration' },
  { value: '100', label: 'Over 100 ms' },
  { value: '500', label: 'Over 500 ms' },
  { value: '1000', label: 'Over 1 s' },
  { value: '5000', label: 'Over 5 s' },
];

export function SpanStatus({ status, httpStatus }: { status: number; httpStatus?: number | null }) {
  if (status === 2) return <Badge variant="destructive">{httpStatus ?? 'Error'}</Badge>;
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {httpStatus ?? (status === 1 ? 'OK' : '–')}
    </Badge>
  );
}

export function TracesView() {
  const website = useCurrentWebsite();
  const searchParams = useSearchParams();
  const route = searchParams.get('route') ?? undefined;
  const [status, setStatus] = useState<'all' | 'error' | 'ok'>('all');
  const [minDuration, setMinDuration] = useState('0');
  const [sort, setSort] = useState<'recent' | 'slowest'>('recent');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());

  const filters: TraceFilters = {
    route,
    status: status === 'all' ? undefined : status,
    minDurationMs: Number(minDuration) || undefined,
    search: deferredSearch || undefined,
    sort,
    page,
  };
  const { data, isPending, error } = useTraces(website.id, filters);
  const pages = data ? Math.max(1, Math.ceil(data.count / data.pageSize)) : 1;
  const reset = <T,>(set: (v: T) => void) => (value: T) => {
    set(value);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <SystemHeader
        icon={ChartGantt}
        title="Traces"
        description="Each request a service handled, and each job run, with what happened inside it. Open one for its waterfall."
      />
      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="flex items-center gap-2">
            Requests and job runs
            {route && (
              <Badge variant="outline" className="font-mono font-normal">
                {route}
              </Badge>
            )}
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={status} onValueChange={reset(v => setStatus(v as typeof status))}>
              <SelectTrigger className="w-36" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Any status</SelectItem>
                  <SelectItem value="error">Errors only</SelectItem>
                  <SelectItem value="ok">Without errors</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={minDuration} onValueChange={reset(setMinDuration)}>
              <SelectTrigger className="w-36" aria-label="Duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DURATIONS.map(d => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={reset(v => setSort(v as typeof sort))}>
              <SelectTrigger className="w-36" aria-label="Sort">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="recent">Newest first</SelectItem>
                  <SelectItem value="slowest">Slowest first</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <InputGroup className="w-full sm:w-56">
              <InputGroupInput
                placeholder="Search names"
                value={search}
                onChange={event => reset(setSearch)(event.target.value)}
                aria-label="Search span names"
              />
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
            </InputGroup>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <QueryError error={error} />
          ) : isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : !data?.data.length ? (
            data?.count === 0 && !filters.status && !filters.minDurationMs && !filters.search && !route ? (
              <NoMonitoringData websiteId={website.id} what="traces in this period" />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">Nothing matches these filters.</p>
            )
          ) : (
            <div className="flex flex-col gap-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden md:table-cell">Service</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Spans</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map(trace => (
                    <TableRow key={`${trace.traceId}:${trace.spanId}`}>
                      <TableCell className="max-w-0 w-full">
                        <Link
                          href={`/websites/${website.id}/system/traces/${trace.traceId}?span=${trace.spanId}`}
                          className="block truncate font-mono text-sm hover:underline"
                        >
                          {trace.name}
                        </Link>
                        {trace.statusMessage && (
                          <span className="block truncate text-xs text-red-600 dark:text-red-400">
                            {trace.statusMessage}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{trace.service}</TableCell>
                      <TableCell>
                        <SpanStatus status={trace.status} httpStatus={trace.httpStatus} />
                      </TableCell>
                      <TableCell className={cn('text-right tabular-nums', trace.durationMs >= 1000 && 'font-medium')}>
                        {formatMs(trace.durationMs)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">
                        {trace.spanCount}
                      </TableCell>
                      <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground lg:table-cell">
                        {formatDistanceToNowStrict(new Date(trace.startTime), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pages > 1 && (
                <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
                  <span>
                    Page {page} of {pages}
                  </span>
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
