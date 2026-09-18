'use client';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  MousePointerClick,
  Play,
  RotateCcw,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { DeviceIcon } from '@/components/analytics/sessions-view';
import { StatCards } from '@/components/analytics/stat-cards';
import { formatMetricLabel } from '@/components/analytics/metric-labels';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { userHref } from '@/components/users/users-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCurrentWebsite } from '@/components/websites/website-context';
import {
  type ErrorEventDetail,
  type ErrorGroupDetail,
  type ErrorStatus,
  useErrorEvent,
  useErrorGroup,
  useSetErrorStatus,
} from '@/hooks/queries/errors';
import { formatLongNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ErrorsChart } from './errors-chart';
import { PlatformBadge } from './errors-view';

type Frame = NonNullable<ErrorEventDetail['frames']>[number];

function StatusActions({ group }: { group: ErrorGroupDetail }) {
  const website = useCurrentWebsite();
  const setStatus = useSetErrorStatus(website.id, group.id);

  if (!website.canUpdate) return null;

  const change = (status: ErrorStatus, message: string) =>
    setStatus.mutate(status, {
      onSuccess: () => toast.success(message),
      onError: error => toast.error(error.message),
    });

  return (
    <div className="flex items-center gap-2">
      {group.status === 'open' ? (
        <>
          <Button
            disabled={setStatus.isPending}
            onClick={() => change('resolved', 'Resolved. It will reopen if it happens again.')}
          >
            <CheckCircle2 data-icon="inline-start" />
            Resolve
          </Button>
          <Button
            variant="outline"
            disabled={setStatus.isPending}
            onClick={() => change('ignored', 'Ignored')}
          >
            <EyeOff data-icon="inline-start" />
            Ignore
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          disabled={setStatus.isPending}
          onClick={() => change('open', 'Reopened')}
        >
          <RotateCcw data-icon="inline-start" />
          Reopen
        </Button>
      )}
    </div>
  );
}

function FrameRow({ frame }: { frame: Frame }) {
  return (
    <li
      className={cn(
        'flex flex-col gap-0.5 rounded-md px-3 py-2 font-mono text-xs',
        frame.inApp ? 'bg-muted' : 'text-muted-foreground',
      )}
    >
      <span className={cn(frame.inApp && 'font-semibold text-foreground')}>
        {frame.function || '(anonymous)'}
      </span>
      <span className="break-all text-muted-foreground">
        {frame.file}
        {frame.line !== null && `:${frame.line}`}
        {frame.column !== null && `:${frame.column}`}
      </span>
    </li>
  );
}

function StackTrace({ event }: { event: ErrorEventDetail }) {
  const [showAll, setShowAll] = useState(false);
  const frames = event.frames ?? [];
  const hidden = frames.filter(frame => !frame.inApp).length;
  const visible = showAll || hidden === frames.length ? frames : frames.filter(f => f.inApp);

  if (!frames.length) {
    return event.stack ? (
      <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
        {event.stack}
      </pre>
    ) : (
      <p className="text-sm text-muted-foreground">No stack trace was sent with this error.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="flex flex-col gap-1">
        {visible.map((frame, index) => (
          <FrameRow key={index} frame={frame} />
        ))}
      </ol>
      {hidden > 0 && hidden < frames.length && (
        <Button variant="ghost" size="sm" className="w-fit" onClick={() => setShowAll(!showAll)}>
          {showAll
            ? 'Hide library frames'
            : `Show ${hidden} library ${hidden === 1 ? 'frame' : 'frames'}`}
        </Button>
      )}
    </div>
  );
}

const BREADCRUMB_ICONS: Record<string, typeof Eye> = {
  navigation: Eye,
  event: Zap,
  click: MousePointerClick,
  request: Globe,
};

function Breadcrumbs({ event }: { event: ErrorEventDetail }) {
  const breadcrumbs: { type: string; message: string; timestamp?: number }[] =
    event.context?.breadcrumbs ?? [];
  const errorAt = new Date(event.createdAt).getTime();

  if (!breadcrumbs.length) {
    return (
      <p className="text-sm text-muted-foreground">No steps were recorded before this error.</p>
    );
  }

  return (
    <ol className="flex flex-col border-l pl-4">
      {breadcrumbs.map((crumb, index) => {
        const Icon = BREADCRUMB_ICONS[crumb.type] ?? Zap;
        const before = crumb.timestamp ? Math.max(0, (errorAt - crumb.timestamp) / 1000) : null;

        return (
          <li key={index} className="relative flex items-center gap-2 py-1.5 text-sm">
            <span className="absolute -left-[21px] flex size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={crumb.type} />
            <span className="min-w-0 flex-1 truncate">{crumb.message}</span>
            {before !== null && (
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {before < 60
                  ? `${before.toFixed(1)}s before`
                  : `${Math.round(before / 60)}m before`}
              </span>
            )}
          </li>
        );
      })}
      <li className="relative flex items-center gap-2 py-1.5 text-sm font-medium text-destructive">
        <span className="absolute -left-[21px] flex size-2.5 rounded-full border-2 border-background bg-destructive" />
        {event.type}: {event.message}
      </li>
    </ol>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{value || '–'}</dd>
    </div>
  );
}

function EventContext({ event }: { event: ErrorEventDetail }) {
  const website = useCurrentWebsite();
  const context = event.context ?? {};
  const tags: Record<string, string> = context.tags ?? {};

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-4">
        <Detail label="When" value={format(new Date(event.createdAt), 'd MMM yyyy, h:mm:ss a')} />
        <Detail
          label="User"
          value={
            event.distinctId ? (
              <Link
                href={userHref(website.id, event.distinctId)}
                className="text-primary hover:underline"
              >
                {context.user?.name || event.distinctId}
              </Link>
            ) : (
              'Anonymous'
            )
          }
        />
        <Detail
          label="Page"
          value={
            event.urlPath &&
            `${context.request?.method ? `${context.request.method} ` : ''}${event.hostname ?? ''}${event.urlPath}`
          }
        />
        <Detail
          label="Handled"
          value={context.handled ? 'Yes (reported by code)' : 'No (uncaught)'}
        />
        <Detail
          label="Browser"
          value={
            event.browser &&
            `${formatMetricLabel('browser', event.browser)} · ${formatMetricLabel('os', event.os)}`
          }
        />
        <Detail
          label="Release"
          value={[event.release, event.environment].filter(Boolean).join(' · ')}
        />
      </dl>
      {Object.keys(tags).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.entries(tags).map(([key, value]) => (
            <Badge key={key} variant="secondary" className="font-mono font-normal">
              {key}: {value}
            </Badge>
          ))}
        </div>
      )}
      {context.extra && Object.keys(context.extra).length > 0 && (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
          {JSON.stringify(context.extra, null, 2)}
        </pre>
      )}
    </div>
  );
}

function Breakdown({
  title,
  rows,
  label,
}: {
  title: string;
  rows: { x: string; y: number }[];
  label?: (x: string) => string;
}) {
  const total = rows.reduce((sum, row) => sum + row.y, 0);

  if (!rows.length) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      <ul className="flex flex-col gap-1.5">
        {rows.map(row => (
          <li key={row.x} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate">{label ? label(row.x) : row.x}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round((row.y / total) * 100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-destructive/70"
                style={{ width: `${(row.y / total) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ErrorDetail({ groupId }: { groupId: string }) {
  const website = useCurrentWebsite();
  const { data: group, isPending, error } = useErrorGroup(website.id, groupId);
  const [selectedId, setSelectedId] = useState<string>();
  const eventId = selectedId ?? group?.occurrences[0]?.id;
  const { data: event } = useErrorEvent(website.id, groupId, eventId);

  if (isPending) return <Skeleton className="h-96 w-full" />;

  if (error || !group) {
    return <p className="text-sm text-muted-foreground">This error could not be found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link
          href={`/websites/${website.id}/errors`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Errors
        </Link>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">
              {group.type}
              <span className="font-normal text-muted-foreground">: {group.message}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <PlatformBadge platform={group.platform} />
              {group.status !== 'open' && (
                <Badge variant="secondary" className="capitalize">
                  {group.status}
                </Badge>
              )}
              {group.regressedAt && <Badge variant="destructive">Regressed</Badge>}
              {group.culprit && <span className="font-mono text-xs">{group.culprit}</span>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusActions group={group} />
            <DateRangePicker websiteId={website.id} />
          </div>
        </div>
      </div>

      <StatCards
        stats={[
          { label: 'Events', value: group.events, format: formatLongNumber },
          { label: 'Affected users', value: group.users, format: formatLongNumber },
          { label: 'All time', value: Number(group.total), format: formatLongNumber },
        ]}
      />

      <div className="grid gap-6 *:min-w-0 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Stack trace</CardTitle>
              <CardDescription>
                {event
                  ? `Occurrence from ${formatDistanceToNowStrict(new Date(event.createdAt), { addSuffix: true })}. Your code is highlighted.`
                  : 'Loading…'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {event ? <StackTrace event={event} /> : <Skeleton className="h-40 w-full" />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Steps before the error</CardTitle>
            </CardHeader>
            <CardContent>
              {event ? <Breadcrumbs event={event} /> : <Skeleton className="h-24 w-full" />}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              {event ? <EventContext event={event} /> : <Skeleton className="h-32 w-full" />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Where it happens</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <ErrorsChart series={group.series} className="aspect-auto h-28 w-full" />
              <Breakdown title="Pages" rows={group.breakdowns.pages} />
              <Breakdown
                title="Browsers"
                rows={group.breakdowns.browsers}
                label={x => formatMetricLabel('browser', x)}
              />
              <Breakdown title="Releases" rows={group.breakdowns.releases} />
              <Breakdown title="Environments" rows={group.breakdowns.environments} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent occurrences</CardTitle>
          <CardDescription>Select one to see its stack trace and steps.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>User</TableHead>
                <TableHead className="hidden md:table-cell">Page</TableHead>
                <TableHead className="hidden lg:table-cell">Browser</TableHead>
                <TableHead className="hidden lg:table-cell">Release</TableHead>
                <TableHead className="text-right">Replay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.occurrences.map(occurrence => (
                <TableRow
                  key={occurrence.id}
                  data-state={occurrence.id === eventId ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => setSelectedId(occurrence.id)}
                >
                  <TableCell className="whitespace-nowrap">
                    {format(new Date(occurrence.createdAt), 'd MMM, h:mm:ss a')}
                  </TableCell>
                  <TableCell>
                    {occurrence.distinctId ? (
                      <Link
                        href={userHref(website.id, occurrence.distinctId)}
                        className="font-mono text-xs text-primary hover:underline"
                        onClick={event => event.stopPropagation()}
                      >
                        {occurrence.distinctId}
                      </Link>
                    ) : occurrence.sessionId ? (
                      <Link
                        href={`/websites/${website.id}/sessions/${occurrence.sessionId}`}
                        className="flex items-center gap-2 font-mono text-xs text-muted-foreground hover:underline"
                        onClick={event => event.stopPropagation()}
                      >
                        <DeviceIcon device={occurrence.device} />
                        {occurrence.sessionId.slice(0, 8)}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    {occurrence.urlPath || '–'}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {occurrence.browser ? formatMetricLabel('browser', occurrence.browser) : '–'}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {occurrence.release || '–'}
                  </TableCell>
                  <TableCell className="text-right">
                    {occurrence.hasReplay && occurrence.visitId && (
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          href={`/websites/${website.id}/replays/${occurrence.visitId}?at=${new Date(occurrence.createdAt).getTime()}`}
                          onClick={event => event.stopPropagation()}
                        >
                          <Play data-icon="inline-start" />
                          Watch
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
