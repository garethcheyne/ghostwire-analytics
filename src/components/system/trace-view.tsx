'use client';
import { ArrowLeft, ChartGantt } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { QueryError } from '@/components/query-error';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { type TraceSpan, useTrace } from '@/hooks/queries/system';
import { cn } from '@/lib/utils';
import { SERIES_COLORS } from './charts';
import { formatMs, SPAN_KINDS } from './format';
import { SpanStatus } from './traces-view';

interface Row {
  span: TraceSpan;
  depth: number;
  offset: number;
}

/** Spans in tree order (children under their parent, by start), with depth and start offset. */
export function waterfall(spans: TraceSpan[]): { rows: Row[]; start: number; total: number } {
  if (!spans.length) return { rows: [], start: 0, total: 0 };

  const start = Math.min(...spans.map(s => new Date(s.startTime).getTime()));
  const end = Math.max(...spans.map(s => new Date(s.startTime).getTime() + s.durationMs));
  const ids = new Set(spans.map(s => s.spanId));
  const children = new Map<string | null, TraceSpan[]>();

  for (const span of spans) {
    // A parent outside this trace's stored spans (another service, sampled out) makes a root.
    const parent = span.parentSpanId && ids.has(span.parentSpanId) ? span.parentSpanId : null;
    const list = children.get(parent) ?? [];
    list.push(span);
    children.set(parent, list);
  }

  const rows: Row[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    const list = (children.get(parent) ?? []).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
    for (const span of list) {
      if (seen.has(span.spanId)) continue;
      seen.add(span.spanId);
      rows.push({ span, depth, offset: new Date(span.startTime).getTime() - start });
      walk(span.spanId, depth + 1);
    }
  };
  walk(null, 0);

  return { rows, start, total: Math.max(end - start, 0.001) };
}

function Value({ value }: { value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return <span className="font-mono text-xs break-all">{text}</span>;
}

function SpanDetail({ span, websiteId }: { span: TraceSpan; websiteId: string }) {
  const exceptions = span.events?.filter(e => e.name === 'exception') ?? [];
  const others = span.events?.filter(e => e.name !== 'exception') ?? [];
  const fields: [string, React.ReactNode][] = [
    ['Service', `${span.namespace ? `${span.namespace} / ` : ''}${span.service}${span.version ? ` (${span.version})` : ''}`],
    ['Kind', SPAN_KINDS[span.kind] ?? span.kind],
    ['Duration', formatMs(span.durationMs)],
    ['Started', new Date(span.startTime).toLocaleString()],
    ...(span.statusMessage ? ([['Status', span.statusMessage]] as [string, React.ReactNode][]) : []),
    ...(span.dbSystem ? ([['System', span.dbSystem]] as [string, React.ReactNode][]) : []),
    ...(span.peer ? ([['Peer', span.peer]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-base break-all">{span.name}</CardTitle>
        <CardDescription className="flex items-center gap-2 font-mono text-xs">
          <SpanStatus status={span.status} httpStatus={span.httpStatus} />
          span {span.spanId}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableBody>
            {fields.map(([label, value]) => (
              <TableRow key={label}>
                <TableCell className="w-32 text-muted-foreground">{label}</TableCell>
                <TableCell>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {span.dbStatement && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Statement</span>
            <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
              {span.dbStatement}
            </pre>
          </div>
        )}

        {exceptions.map((event, i) => (
          <div key={i} className="flex flex-col gap-1">
            <span className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
              {String(event.attributes['exception.type'] ?? 'Exception')}
              {span.errorGroupId && i === 0 && (
                <Link
                  href={`/websites/${websiteId}/errors/${span.errorGroupId}`}
                  className="text-xs font-normal text-primary underline-offset-4 hover:underline"
                >
                  Open in Errors
                </Link>
              )}
            </span>
            <span className="text-sm">{String(event.attributes['exception.message'] ?? '')}</span>
            {typeof event.attributes['exception.stacktrace'] === 'string' && (
              <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
                {event.attributes['exception.stacktrace']}
              </pre>
            )}
          </div>
        ))}

        {!!Object.keys(span.attributes ?? {}).length && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Attributes</span>
            <Table>
              <TableBody>
                {Object.entries(span.attributes ?? {})
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => (
                    <TableRow key={key}>
                      <TableCell className="w-1/3 align-top font-mono text-xs text-muted-foreground break-all">
                        {key}
                      </TableCell>
                      <TableCell>
                        <Value value={value} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!!others.length && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">Events</span>
            {others.map((event, i) => (
              <div key={i} className="text-xs">
                <span className="font-mono">{event.name}</span>{' '}
                <span className="text-muted-foreground">{new Date(event.timeMs).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TraceView({ traceId }: { traceId: string }) {
  const website = useCurrentWebsite();
  const searchParams = useSearchParams();
  const { data, isPending, error } = useTrace(website.id, traceId);
  const { rows, total } = useMemo(() => waterfall(data?.spans ?? []), [data]);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('span'));
  const services = [...new Set(rows.map(r => r.span.service))];
  const color = (service: string) => SERIES_COLORS[services.indexOf(service) % SERIES_COLORS.length];
  const errors = rows.filter(r => r.span.status === 2).length;
  // Named after the request it served (the first server or consumer span), else its root.
  const entry = rows.find(r => r.span.kind === 2 || r.span.kind === 5)?.span ?? rows[0]?.span;
  const selected = rows.find(r => r.span.spanId === selectedId)?.span ?? entry;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ChartGantt}
        title={entry?.name ?? 'Trace'}
        description={
          <span className="font-mono text-xs">
            trace {traceId}
            {rows.length > 0 && ` · ${formatMs(total)} · ${rows.length} spans · ${services.length} services`}
            {errors > 0 && ` · ${errors} failed`}
          </span>
        }
        backButton={
          <Link
            href={`/websites/${website.id}/system/traces`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Traces
          </Link>
        }
      />

      {error ? (
        <QueryError error={error} />
      ) : isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Waterfall</CardTitle>
              <CardDescription className="flex flex-wrap gap-3">
                {services.map(service => (
                  <span key={service} className="flex items-center gap-1.5">
                    <span className="size-2 rounded-full" style={{ background: color(service) }} />
                    {service}
                  </span>
                ))}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-0.5 overflow-x-auto">
              {rows.map(({ span, depth, offset }) => (
                <button
                  key={span.spanId}
                  type="button"
                  onClick={() => setSelectedId(span.spanId)}
                  className={cn(
                    'grid min-w-[36rem] grid-cols-[minmax(0,2fr)_minmax(0,3fr)_4.5rem] items-center gap-3 rounded-md px-2 py-1 text-left text-xs hover:bg-muted/50',
                    selected?.spanId === span.spanId && 'bg-muted',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: `${Math.min(depth, 12) * 12}px` }}>
                    {span.status === 2 && <span className="size-1.5 shrink-0 rounded-full bg-red-500" />}
                    <span className="truncate font-mono">{span.name}</span>
                    {span.kind === 3 && span.dbSystem && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] font-normal">
                        {span.dbSystem}
                      </Badge>
                    )}
                  </span>
                  <span className="relative h-3 rounded-sm bg-muted">
                    <span
                      className="absolute top-0 h-3 rounded-sm"
                      style={{
                        left: `${(offset / total) * 100}%`,
                        width: `max(2px, ${(span.durationMs / total) * 100}%)`,
                        background: span.status === 2 ? 'var(--destructive)' : color(span.service),
                      }}
                    />
                  </span>
                  <span className="text-right font-mono tabular-nums text-muted-foreground">
                    {formatMs(span.durationMs)}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
          {selected && <SpanDetail span={selected} websiteId={website.id} />}
        </div>
      )}
    </div>
  );
}
