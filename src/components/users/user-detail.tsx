'use client';
import { format, formatDistanceStrict, formatDistanceToNowStrict } from 'date-fns';
import { ArrowLeft, Eye, Play, Zap } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { formatMetricLabel } from '@/components/analytics/metric-labels';
import { DeviceIcon } from '@/components/analytics/sessions-view';
import { StatCards } from '@/components/analytics/stat-cards';
import { CopyButton } from '@/components/copy-button';
import { formatReplayLength } from '@/components/replays/replays-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { type WebsiteUserDetail, useWebsiteUser } from '@/hooks/queries/users';
import { formatLongNumber } from '@/lib/format';

const ACTIVITY_LIMIT = 500;

type Activity = WebsiteUserDetail['activity'][number];
type Session = WebsiteUserDetail['sessions'][number];

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{value ?? '–'}</dd>
    </div>
  );
}

function describeSession(session: Session | undefined) {
  if (!session) return null;

  return [
    formatMetricLabel('browser', session.browser),
    formatMetricLabel('os', session.os),
    [session.city, session.country && formatMetricLabel('country', session.country)]
      .filter(Boolean)
      .join(', '),
  ]
    .filter(Boolean)
    .join(' · ');
}

function Timeline({ user }: { user: WebsiteUserDetail }) {
  const website = useCurrentWebsite();
  const sessions = useMemo(() => new Map(user.sessions.map(s => [s.id, s])), [user.sessions]);
  const replays = useMemo(() => new Map(user.replays.map(r => [r.id, r])), [user.replays]);

  // Newest visit first; actions inside a visit in time order.
  const visits = useMemo(() => {
    const groups = new Map<string, Activity[]>();

    for (const item of user.activity) {
      if (!groups.has(item.visitId)) groups.set(item.visitId, []);
      groups.get(item.visitId)!.push(item);
    }

    return [...groups.values()]
      .map(items => items.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)))
      .sort((a, b) => +new Date(b[0].createdAt) - +new Date(a[0].createdAt));
  }, [user.activity]);

  if (!visits.length) {
    return <p className="text-sm text-muted-foreground">No page views or events recorded.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {visits.map(items => {
        const first = items[0];
        const start = new Date(first.createdAt);
        const end = new Date(items[items.length - 1].createdAt);
        const session = sessions.get(first.sessionId);
        const replay = replays.get(first.visitId);

        return (
          <div key={first.visitId} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <DeviceIcon device={session?.device ?? null} />
                <span className="text-sm font-medium">
                  {format(start, 'EEE d MMM yyyy, h:mm a')}
                </span>
                <Link
                  href={`/websites/${website.id}/sessions/${first.sessionId}`}
                  className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {describeSession(session) || 'Session'}
                </Link>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {items.length} {items.length === 1 ? 'action' : 'actions'}
                  {end > start && ` · ${formatDistanceStrict(end, start)}`}
                </span>
                {replay && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/websites/${website.id}/replays/${replay.id}`}>
                      <Play data-icon="inline-start" />
                      Watch replay ({formatReplayLength(replay.duration)})
                    </Link>
                  </Button>
                )}
              </div>
            </div>
            <ol className="flex flex-col border-l pl-4">
              {items.map(item => (
                <li key={item.eventId} className="relative flex items-center gap-2 py-1.5 text-sm">
                  <span className="absolute -left-[21px] flex size-2.5 rounded-full border-2 border-background bg-muted-foreground" />
                  {item.eventName ? (
                    <Zap className="size-4 shrink-0 text-chart-4" aria-label="Event" />
                  ) : (
                    <Eye className="size-4 shrink-0 text-muted-foreground" aria-label="Page view" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {item.eventName ? (
                      <>
                        <span className="font-medium">{item.eventName}</span>
                        <span className="text-muted-foreground"> on {item.urlPath}</span>
                      </>
                    ) : (
                      item.urlPath
                    )}
                    {item.referrerDomain && (
                      <span className="text-muted-foreground"> from {item.referrerDomain}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {format(new Date(item.createdAt), 'h:mm:ss a')}
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

export function UserDetail({ userId }: { userId: string }) {
  const website = useCurrentWebsite();
  const { data: user, isPending, error } = useWebsiteUser(website.id, userId);

  if (isPending) return <Skeleton className="h-96 w-full" />;

  if (error || !user) {
    return (
      <p className="text-sm text-muted-foreground">No user with the ID &ldquo;{userId}&rdquo;.</p>
    );
  }

  const field = (key: string) => user.properties.find(p => p.dataKey === key)?.stringValue;
  const name = field('name');
  const email = field('email');
  const lastSeen = user.sessions[0]?.lastAt;
  const firstSeen = user.sessions.reduce<string | undefined>(
    (min, session) => (!min || session.firstAt < min ? session.firstAt : min),
    undefined,
  );
  // A browser has an anonymous and a logged-in session; show each device/browser once.
  const devices = [
    ...user.sessions
      .reduce((map, session) => {
        const key = [session.device, session.browser, session.os].join('|');
        const existing = map.get(key);
        if (!existing || session.lastAt > existing.lastAt) map.set(key, session);
        return map;
      }, new Map<string, Session>())
      .values(),
  ];
  const sum = (key: 'visits' | 'views' | 'events') =>
    user.sessions.reduce((total, session) => total + Number(session[key]), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href={`/websites/${website.id}/users`}
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Users
        </Link>
        <h1 className="truncate text-2xl font-semibold tracking-tight">{name || user.id}</h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="font-mono">{user.id}</span>
            <CopyButton value={user.id} label="Copy user ID" />
          </span>
          {email && <span>{email}</span>}
          {lastSeen && (
            <span>
              Last seen {formatDistanceToNowStrict(new Date(lastSeen), { addSuffix: true })}
            </span>
          )}
        </div>
      </div>

      <StatCards
        stats={[
          { label: 'Devices', value: devices.length, format: formatLongNumber },
          { label: 'Visits', value: sum('visits'), format: formatLongNumber },
          { label: 'Views', value: sum('views'), format: formatLongNumber },
          { label: 'Events', value: sum('events'), format: formatLongNumber },
          { label: 'Replays', value: user.replays.length, format: formatLongNumber },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Identified as</CardTitle>
              <CardDescription>Latest values the site passed to identify.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                {user.properties.map(property => (
                  <Detail
                    key={property.dataKey}
                    label={property.dataKey}
                    value={
                      property.stringValue ??
                      property.numberValue ??
                      (property.dateValue && format(new Date(property.dateValue), 'd MMM yyyy'))
                    }
                  />
                ))}
                <Detail
                  label="First seen"
                  value={firstSeen && format(new Date(firstSeen), 'd MMM yyyy, h:mm a')}
                />
                <Detail
                  label="Last seen"
                  value={lastSeen && format(new Date(lastSeen), 'd MMM yyyy, h:mm a')}
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Devices</CardTitle>
              <CardDescription>Browsers they used, most recent first.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col">
                {devices.map(session => (
                  <li key={session.id}>
                    <Link
                      href={`/websites/${website.id}/sessions/${session.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <DeviceIcon device={session.device} />
                      <span className="min-w-0 flex-1 truncate">{describeSession(session)}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNowStrict(new Date(session.lastAt), { addSuffix: true })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>
              Every visit, newest first, including browsing before they logged in on the same
              device.
              {user.activity.length >= ACTIVITY_LIMIT &&
                ` Showing the most recent ${ACTIVITY_LIMIT} actions.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Timeline user={user} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
