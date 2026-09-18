'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { useSessionStats, useWebsiteSessions } from '@/hooks/queries/analytics';
import { formatLongNumber } from '@/lib/format';
import { formatMetricLabel } from './metric-labels';
import { StatCards } from './stat-cards';
import { WebsiteHeader } from './website-header';
import { WeeklyTraffic } from './weekly-traffic';
import { AppLink } from '@/components/share/share-context';

const PAGE_SIZE = 25;

export function DeviceIcon({ device }: { device: string | null }) {
  const Icon = device === 'mobile' ? Smartphone : device === 'tablet' ? Tablet : Monitor;

  return <Icon className="size-4 text-muted-foreground" aria-label={device ?? 'Unknown device'} />;
}

function SessionStatsBar({ websiteId }: { websiteId: string }) {
  const { data } = useSessionStats(websiteId);

  return (
    <StatCards
      loading={!data}
      stats={
        data && [
          { label: 'Visitors', value: data.visitors.value, format: formatLongNumber },
          { label: 'Visits', value: data.visits.value, format: formatLongNumber },
          { label: 'Views', value: data.pageviews.value, format: formatLongNumber },
          { label: 'Events', value: data.events.value, format: formatLongNumber },
          { label: 'Countries', value: data.countries.value, format: formatLongNumber },
        ]
      }
    />
  );
}

function SessionsTable({ websiteId }: { websiteId: string }) {
  const [page, setPage] = useState(1);
  const { data, isPending } = useWebsiteSessions(websiteId, page, PAGE_SIZE);
  const pageCount = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  if (isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!data?.data.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No sessions for this period.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Session</TableHead>
            <TableHead className="text-right">Visits</TableHead>
            <TableHead className="text-right">Views</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Events</TableHead>
            <TableHead className="hidden lg:table-cell">Location</TableHead>
            <TableHead className="hidden md:table-cell">Browser</TableHead>
            <TableHead className="hidden lg:table-cell">OS</TableHead>
            <TableHead className="text-right">Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data.map(session => (
            <TableRow key={`${session.id}-${session.hostname}`}>
              <TableCell>
                <AppLink
                  href={`/websites/${websiteId}/sessions/${session.id}`}
                  className="flex items-center gap-2 font-mono text-xs text-primary hover:underline"
                >
                  <DeviceIcon device={session.device} />
                  {session.id.slice(0, 8)}
                </AppLink>
              </TableCell>
              <TableCell className="text-right tabular-nums">{session.visits}</TableCell>
              <TableCell className="text-right tabular-nums">{session.views}</TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">{session.events}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {[session.city, session.country && formatMetricLabel('country', session.country)]
                  .filter(Boolean)
                  .join(', ') || '–'}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {formatMetricLabel('browser', session.browser)}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {formatMetricLabel('os', session.os)}
              </TableCell>
              <TableCell
                className="text-right whitespace-nowrap text-muted-foreground"
                title={new Date(session.lastAt).toLocaleString()}
              >
                {formatDistanceToNowStrict(new Date(session.lastAt), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
          <span>
            Page {page} of {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export function SessionsView() {
  const { id } = useCurrentWebsite();

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Sessions" />
      <SessionStatsBar websiteId={id} />
      <WeeklyTraffic websiteId={id} />
      <Card>
        <CardHeader>
          <CardTitle>Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <SessionsTable websiteId={id} />
        </CardContent>
      </Card>
    </div>
  );
}
