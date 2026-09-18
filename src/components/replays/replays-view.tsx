'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Bookmark, Play, Video } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { formatMetricLabel } from '@/components/analytics/metric-labels';
import { DeviceIcon } from '@/components/analytics/sessions-view';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardAction } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useReplays, useSavedReplays } from '@/hooks/queries/replays';
import { RecordingNotice } from './recording-notice';

const PAGE_SIZE = 25;

const MIN_DURATIONS = [
  { value: '0', label: 'Any length' },
  { value: '5', label: '5s or longer' },
  { value: '30', label: '30s or longer' },
  { value: '60', label: '1m or longer' },
  { value: '300', label: '5m or longer' },
];

export function formatReplayLength(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function Pager({
  page,
  count,
  onChange,
}: {
  page: number;
  count: number;
  onChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));

  if (pageCount <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <span>
        Page {page} of {pageCount}
      </span>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </div>
  );
}

function NoReplays({ title, description }: { title: string; description: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Video />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function RecentReplays({ websiteId, minDuration }: { websiteId: string; minDuration: number }) {
  const [page, setPage] = useState(1);
  const { data, isPending } = useReplays(websiteId, { page, pageSize: PAGE_SIZE, minDuration });

  if (isPending) return <Skeleton className="h-64 w-full" />;

  if (!data?.data.length) {
    return (
      <NoReplays
        title="No replays"
        description="No recorded visits match this period and these filters."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            <TableHead>Visitor</TableHead>
            <TableHead className="text-right">Length</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Actions</TableHead>
            <TableHead className="hidden lg:table-cell">Location</TableHead>
            <TableHead className="hidden md:table-cell">Browser</TableHead>
            <TableHead className="hidden lg:table-cell">OS</TableHead>
            <TableHead className="text-right">Recorded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data.map(replay => (
            <TableRow key={replay.id}>
              <TableCell>
                <Button variant="ghost" size="icon-sm" asChild>
                  <Link
                    href={`/websites/${websiteId}/replays/${replay.id}`}
                    aria-label="Play replay"
                  >
                    <Play />
                  </Link>
                </Button>
              </TableCell>
              <TableCell>
                <Link
                  href={`/websites/${websiteId}/sessions/${replay.sessionId}`}
                  className="flex items-center gap-2 font-mono text-xs text-primary hover:underline"
                >
                  <DeviceIcon device={replay.device} />
                  {replay.sessionId.slice(0, 8)}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatReplayLength(Number(replay.duration))}
              </TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {Number(replay.eventCount).toLocaleString()}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {[replay.city, replay.country && formatMetricLabel('country', replay.country)]
                  .filter(Boolean)
                  .join(', ') || '–'}
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {formatMetricLabel('browser', replay.browser)}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {formatMetricLabel('os', replay.os)}
              </TableCell>
              <TableCell
                className="text-right whitespace-nowrap text-muted-foreground"
                title={new Date(replay.createdAt).toLocaleString()}
              >
                {formatDistanceToNowStrict(new Date(replay.createdAt), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager page={page} count={data.count} onChange={setPage} />
    </div>
  );
}

function SavedReplays({ websiteId }: { websiteId: string }) {
  const [page, setPage] = useState(1);
  const { data, isPending } = useSavedReplays(websiteId, page, PAGE_SIZE);

  if (isPending) return <Skeleton className="h-40 w-full" />;

  if (!data?.data.length) {
    return (
      <NoReplays
        title="No saved replays"
        description="Save a replay from its player to keep it here. Saved replays aren't limited by the date range."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12" />
            <TableHead>Name</TableHead>
            <TableHead className="text-right">Saved</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data.map(saved => (
            <TableRow key={saved.id}>
              <TableCell>
                <Button variant="ghost" size="icon-sm" asChild>
                  <Link
                    href={`/websites/${websiteId}/replays/${saved.visitId}`}
                    aria-label="Play replay"
                  >
                    <Play />
                  </Link>
                </Button>
              </TableCell>
              <TableCell>
                <Link
                  href={`/websites/${websiteId}/replays/${saved.visitId}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <Bookmark className="size-4 text-muted-foreground" />
                  {saved.name || <span className="text-muted-foreground">Untitled replay</span>}
                </Link>
              </TableCell>
              <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                {formatDistanceToNowStrict(new Date(saved.createdAt), { addSuffix: true })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager page={page} count={data.count} onChange={setPage} />
    </div>
  );
}

export function ReplaysView() {
  const { id } = useCurrentWebsite();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab') === 'saved' ? 'saved' : 'recent';
  const minDuration = searchParams.get('minDuration') ?? '0';

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Replays" />
      <RecordingNotice websiteId={id} kind="replays" />
      <Tabs
        value={tab}
        onValueChange={value => setParam('tab', value === 'saved' ? 'saved' : null)}
      >
        <Card>
          <CardHeader>
            <CardTitle>
              <TabsList>
                <TabsTrigger value="recent">Recent</TabsTrigger>
                <TabsTrigger value="saved">Saved</TabsTrigger>
              </TabsList>
            </CardTitle>
            {tab === 'recent' && (
              <CardAction>
                <Select
                  value={minDuration}
                  onValueChange={value => setParam('minDuration', value === '0' ? null : value)}
                >
                  <SelectTrigger size="sm" aria-label="Minimum length">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectGroup>
                      {MIN_DURATIONS.map(option => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            <TabsContent value="recent">
              <RecentReplays websiteId={id} minDuration={Number(minDuration)} />
            </TabsContent>
            <TabsContent value="saved">
              <SavedReplays websiteId={id} />
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
