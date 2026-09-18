'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Bug, Info, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useDeferredValue, useState } from 'react';
import { StatCards } from '@/components/analytics/stat-cards';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { type ErrorStatus, useErrorGroups, useErrorStats } from '@/hooks/queries/errors';
import { useReleases } from '@/hooks/queries/releases';
import { useWebsite } from '@/hooks/queries/websites';
import { formatLongNumber } from '@/lib/format';
import { ErrorsChart } from './errors-chart';

const PAGE_SIZE = 25;

const PLATFORM_LABELS: Record<string, string> = {
  javascript: 'Browser',
  node: 'Node',
  python: 'Python',
  csharp: '.NET',
  other: 'Server',
};

export function PlatformBadge({ platform }: { platform: string }) {
  return (
    <Badge variant="outline" className="font-normal">
      {PLATFORM_LABELS[platform] ?? platform}
    </Badge>
  );
}

function ErrorsNotice({ websiteId }: { websiteId: string }) {
  const { data: website } = useWebsite(websiteId);

  if (!website || website.errorsEnabled) return null;

  return (
    <Alert>
      <Info />
      <AlertTitle>Error reporting is turned off</AlertTitle>
      <AlertDescription>
        <p>
          New errors won&apos;t be accepted until you switch it on and add{' '}
          <code className="font-mono">data-errors=&quot;true&quot;</code> to the tracking script.{' '}
          <Link
            href={`/websites/${websiteId}/settings?tab=errors`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Open error settings
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}

function ErrorGroupsTable({
  status,
  search,
  release,
  newInRelease,
}: {
  status: ErrorStatus;
  search: string;
  release?: string;
  newInRelease?: boolean;
}) {
  const website = useCurrentWebsite();
  const [page, setPage] = useState(1);
  const { data, isPending } = useErrorGroups(website.id, {
    status,
    search,
    page,
    release,
    newInRelease,
  });
  const pageCount = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  if (isPending) return <Skeleton className="h-64 w-full" />;

  if (!data?.data.length) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bug />
          </EmptyMedia>
          <EmptyTitle>
            {search
              ? 'No matching errors'
              : status === 'open'
                ? 'No errors'
                : `No ${status} errors`}
          </EmptyTitle>
          <EmptyDescription>
            {status === 'open'
              ? 'Nothing went wrong in this period. Try a longer date range.'
              : `Nothing ${status} happened in this period.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Error</TableHead>
            <TableHead className="text-right">Events</TableHead>
            <TableHead className="text-right">Users</TableHead>
            <TableHead className="hidden text-right md:table-cell">Last seen</TableHead>
            <TableHead className="hidden text-right lg:table-cell">First seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data.map(group => (
            <TableRow key={group.id}>
              <TableCell className="max-w-0 w-full">
                <Link
                  href={`/websites/${website.id}/errors/${group.id}`}
                  className="flex min-w-0 flex-col gap-1 hover:underline"
                >
                  <span className="truncate">
                    <span className="font-medium">{group.type}</span>
                    <span className="text-muted-foreground">: {group.message}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <PlatformBadge platform={group.platform} />
                    {group.regressedAt && <Badge variant="destructive">Regressed</Badge>}
                    {group.firstRelease && (
                      <Badge variant="outline" className="font-mono">
                        since {group.firstRelease}
                      </Badge>
                    )}
                    {group.culprit && (
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {group.culprit}
                      </span>
                    )}
                  </span>
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatLongNumber(group.events)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatLongNumber(group.users)}
              </TableCell>
              <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground md:table-cell">
                {formatDistanceToNowStrict(new Date(group.lastSeen), { addSuffix: true })}
              </TableCell>
              <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground lg:table-cell">
                {formatDistanceToNowStrict(new Date(group.firstSeen), { addSuffix: true })}
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
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
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

export function ErrorsView() {
  const website = useCurrentWebsite();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = (
    ['resolved', 'ignored'].includes(searchParams.get('status') ?? '')
      ? searchParams.get('status')
      : 'open'
  ) as ErrorStatus;
  const [search, setSearch] = useState('');
  const release = searchParams.get('release') ?? undefined;
  const newInRelease = searchParams.get('new') === '1';
  const { data: releases } = useReleases(website.id);
  const deferredSearch = useDeferredValue(search.trim());
  const { data: stats } = useErrorStats(website.id);

  const setStatus = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === 'open') params.delete('status');
    else params.set('status', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const setRelease = (value: string | null, onlyNew = false) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set('release', value);
    else params.delete('release');
    if (value && onlyNew) params.set('new', '1');
    else params.delete('new');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Errors" />
      <ErrorsNotice websiteId={website.id} />
      <StatCards
        loading={!stats}
        stats={
          stats && [
            { label: 'Errors', value: stats.events, format: formatLongNumber },
            { label: 'Affected users', value: stats.users, format: formatLongNumber },
            { label: 'Issues', value: stats.groups, format: formatLongNumber },
            { label: 'New issues', value: stats.newGroups, format: formatLongNumber },
          ]
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Errors over time</CardTitle>
        </CardHeader>
        <CardContent>
          {stats ? <ErrorsChart series={stats.series} /> : <Skeleton className="h-48 w-full" />}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <Tabs value={status} onValueChange={setStatus}>
              <TabsList>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="resolved">Resolved</TabsTrigger>
                <TabsTrigger value="ignored">Ignored</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardTitle>
          <CardAction className="flex flex-wrap justify-end gap-2">
            {!!releases?.length && (
              <Select
                value={release ?? 'all'}
                onValueChange={value => setRelease(value === 'all' ? null : value, newInRelease)}
              >
                <SelectTrigger className="w-44" aria-label="Release">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All releases</SelectItem>
                    {releases.map(item => (
                      <SelectItem key={item.version} value={item.version}>
                        {item.version}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
            {release && (
              <Button
                variant={newInRelease ? 'secondary' : 'outline'}
                aria-pressed={newInRelease}
                onClick={() => setRelease(release, !newInRelease)}
              >
                New in this release
              </Button>
            )}
            <InputGroup className="w-56">
              <InputGroupInput
                placeholder="Search errors"
                value={search}
                onChange={event => setSearch(event.target.value)}
                aria-label="Search errors"
              />
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
            </InputGroup>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ErrorGroupsTable
            key={`${status}:${deferredSearch}:${release}:${newInRelease}`}
            status={status}
            search={deferredSearch}
            release={release}
            newInRelease={newInRelease}
          />
        </CardContent>
      </Card>
    </div>
  );
}
