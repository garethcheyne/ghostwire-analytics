'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceStrict } from 'date-fns';
import { ArrowLeft, Eye, Trash2, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWebsite } from '@/components/websites/website-context';
import {
  type SessionActivityItem,
  useSession,
  useSessionActivity,
  useSessionProperties,
} from '@/hooks/queries/analytics';
import { api } from '@/lib/api-client';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import { formatMetricLabel } from './metric-labels';
import { DeviceIcon } from './sessions-view';
import { StatCards } from './stat-cards';

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || '–'}</dd>
    </div>
  );
}

function Activity({ items }: { items: SessionActivityItem[] }) {
  // Newest visit first; events inside a visit in time order.
  const visits = useMemo(() => {
    const groups = new Map<string, SessionActivityItem[]>();

    for (const item of items) {
      if (!groups.has(item.visitId)) groups.set(item.visitId, []);
      groups.get(item.visitId)!.push(item);
    }

    return [...groups.values()]
      .map(events => events.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)))
      .sort((a, b) => +new Date(b[0].createdAt) - +new Date(a[0].createdAt));
  }, [items]);

  return (
    <div className="flex flex-col gap-6">
      {visits.map((events, index) => {
        const start = new Date(events[0].createdAt);
        const end = new Date(events[events.length - 1].createdAt);

        return (
          <div key={events[0].visitId} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">
                Visit {visits.length - index} · {format(start, 'd MMM yyyy, h:mm a')}
              </span>
              <span className="text-xs text-muted-foreground">
                {events.length} {events.length === 1 ? 'action' : 'actions'}
                {end > start && ` · ${formatDistanceStrict(end, start)}`}
              </span>
            </div>
            <ol className="flex flex-col border-l pl-4">
              {events.map(event => (
                <li key={event.eventId} className="relative flex items-center gap-2 py-1.5 text-sm">
                  <span className="absolute -left-[21px] flex size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
                  {event.eventName ? (
                    <Zap className="size-4 shrink-0 text-chart-4" aria-label="Event" />
                  ) : (
                    <Eye className="size-4 shrink-0 text-muted-foreground" aria-label="Page view" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {event.eventName ? (
                      <>
                        <span className="font-medium">{event.eventName}</span>
                        <span className="text-muted-foreground"> on {event.urlPath}</span>
                      </>
                    ) : (
                      event.urlPath
                    )}
                    {event.referrerDomain && (
                      <span className="text-muted-foreground"> from {event.referrerDomain}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {format(new Date(event.createdAt), 'h:mm:ss a')}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function DeleteSession({ sessionId }: { sessionId: string }) {
  const website = useCurrentWebsite();
  const router = useRouter();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.del(`/websites/${website.id}/sessions/${sessionId}`),
    onSuccess: () => {
      toast.success('Session deleted');
      queryClient.invalidateQueries({ queryKey: ['analytics', website.id] });
      router.push(`/websites/${website.id}/sessions`);
    },
    onError: e => toast.error(e.message),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <Trash2 data-icon="inline-start" />
          Delete session
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this session?</AlertDialogTitle>
          <AlertDialogDescription>
            Its page views, events, properties and replays will be permanently deleted, for
            example to honour a data deletion request.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => remove.mutate()}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SessionDetail({ sessionId }: { sessionId: string }) {
  const website = useCurrentWebsite();
  const { data: session, isPending, error } = useSession(website.id, sessionId);
  const { data: activity } = useSessionActivity(website.id, sessionId, session?.firstAt, session?.lastAt);
  const { data: properties } = useSessionProperties(website.id, sessionId);

  if (isPending) {
    return <Skeleton className="h-96 w-full" />;
  }

  if (error || !session) {
    return <p className="text-sm text-muted-foreground">This session could not be found.</p>;
  }

  const visits = Number(session.visits);
  const totaltime = Number(session.totaltime);
  const location = [
    session.city,
    session.region && formatMetricLabel('region', session.region),
    session.country && formatMetricLabel('country', session.country),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href={`/websites/${website.id}/sessions`}
            className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Sessions
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <DeviceIcon device={session.device} />
            <span className="font-mono">{session.id.slice(0, 8)}</span>
          </h1>
        </div>
        {session.canDelete && <DeleteSession sessionId={session.id} />}
      </div>

      <StatCards
        stats={[
          { label: 'Visits', value: visits, format: formatLongNumber },
          { label: 'Views', value: Number(session.views), format: formatLongNumber },
          { label: 'Events', value: Number(session.events), format: formatLongNumber },
          {
            label: 'Time on site',
            value: totaltime,
            format: n => formatShortTime(n, ['h', 'm', 's'], ' ') || '0s',
          },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Visitor</CardTitle>
            <CardDescription>Anonymous: a periodically rotating hash of IP and browser, no cookies.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Detail label="First seen" value={format(new Date(session.firstAt), 'd MMM yyyy, h:mm a')} />
              <Detail label="Last seen" value={format(new Date(session.lastAt), 'd MMM yyyy, h:mm a')} />
              <Detail label="Location" value={location} />
              <Detail label="Language" value={session.language && formatMetricLabel('language', session.language)} />
              <Detail label="Browser" value={formatMetricLabel('browser', session.browser)} />
              <Detail label="OS" value={formatMetricLabel('os', session.os)} />
              <Detail label="Device" value={formatMetricLabel('device', session.device)} />
              <Detail label="Screen" value={session.screen} />
              {session.distinctIds.length > 0 && (
                <div className="col-span-2">
                  <Detail
                    label="User ID"
                    value={
                      <span className="flex flex-wrap gap-1">
                        {session.distinctIds.map(id => (
                          <Badge key={id} variant="secondary" className="font-mono">
                            {id}
                          </Badge>
                        ))}
                      </span>
                    }
                  />
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activity ? <Activity items={activity} /> : <Skeleton className="h-40 w-full" />}
          </CardContent>
        </Card>
      </div>

      {properties && properties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Properties</CardTitle>
            <CardDescription>Set with ghostwire.identify().</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {properties.map(property => (
                <Detail
                  key={property.dataKey}
                  label={property.dataKey}
                  value={property.stringValue ?? property.numberValue ?? property.dateValue}
                />
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
