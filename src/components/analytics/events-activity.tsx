'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Eye, Zap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useWebsiteEvents } from '@/hooks/queries/analytics';
import { formatMetricLabel } from './metric-labels';

const PAGE_SIZE = 25;

/** Paged log of pageviews and events for the selected period. */
export function EventsActivity({ websiteId }: { websiteId: string }) {
  const [page, setPage] = useState(1);
  const { data, isPending } = useWebsiteEvents(websiteId, page, PAGE_SIZE);
  const pageCount = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  if (isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!data?.data.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No activity for this period.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Event</TableHead>
            <TableHead className="hidden lg:table-cell">Location</TableHead>
            <TableHead className="hidden md:table-cell">Browser</TableHead>
            <TableHead className="hidden md:table-cell">Device</TableHead>
            <TableHead>Session</TableHead>
            <TableHead className="text-right">When</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data.map(event => (
            <TableRow key={event.id}>
              <TableCell className="max-w-md">
                <div className="flex items-center gap-2">
                  {event.eventName ? (
                    <Zap className="size-4 shrink-0 text-chart-4" aria-label="Event" />
                  ) : (
                    <Eye className="size-4 shrink-0 text-muted-foreground" aria-label="Page view" />
                  )}
                  <span className="truncate">
                    {event.eventName ? (
                      <>
                        <span className="font-medium">{event.eventName}</span>
                        <span className="text-muted-foreground"> on {event.urlPath}</span>
                      </>
                    ) : (
                      event.urlPath
                    )}
                  </span>
                  {event.hasData && <Badge variant="outline">data</Badge>}
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {[event.city, event.country && formatMetricLabel('country', event.country)]
                  .filter(Boolean)
                  .join(', ') || '–'}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {formatMetricLabel('browser', event.browser)}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {formatMetricLabel('device', event.device)}
              </TableCell>
              <TableCell>
                <Link
                  href={`/websites/${websiteId}/sessions/${event.sessionId}`}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  {event.sessionId.slice(0, 8)}
                </Link>
              </TableCell>
              <TableCell
                className="text-right whitespace-nowrap text-muted-foreground"
                title={new Date(event.createdAt).toLocaleString()}
              >
                {formatDistanceToNowStrict(new Date(event.createdAt), { addSuffix: true })}
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
