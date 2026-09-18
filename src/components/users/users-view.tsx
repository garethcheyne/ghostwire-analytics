'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Search, UserSearch } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
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
import { useWebsiteUsers } from '@/hooks/queries/users';

const PAGE_SIZE = 25;

export function userHref(websiteId: string, userId: string) {
  return `/websites/${websiteId}/users/${encodeURIComponent(userId)}`;
}

function UsersTable({ search }: { search: string }) {
  const website = useCurrentWebsite();
  const [page, setPage] = useState(1);
  const { data, isPending } = useWebsiteUsers(website.id, search, page, PAGE_SIZE);
  const pageCount = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  if (isPending) return <Skeleton className="h-64 w-full" />;

  if (!data?.data.length) {
    return search ? (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UserSearch />
          </EmptyMedia>
          <EmptyTitle>No matching users</EmptyTitle>
          <EmptyDescription>
            Nobody was identified with &ldquo;{search}&rdquo;. Search matches the user ID and any
            value your site passed to identify, such as email or name.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UserSearch />
          </EmptyMedia>
          <EmptyTitle>No identified users yet</EmptyTitle>
          <EmptyDescription>
            Visitors show up here once your site passes their username after they log in, with{' '}
            <code className="font-mono">ghostwire.identify()</code>.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/websites/${website.id}/settings?tab=tracking`}>
              How to identify users
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead className="hidden md:table-cell">Email</TableHead>
            <TableHead className="text-right">Sessions</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Visits</TableHead>
            <TableHead className="text-right">Last seen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data.map(user => (
            <TableRow key={user.id}>
              <TableCell>
                <Link
                  href={userHref(website.id, user.id)}
                  className="flex flex-col hover:underline"
                >
                  <span className="font-medium">{user.name || user.id}</span>
                  {user.name && (
                    <span className="font-mono text-xs text-muted-foreground">{user.id}</span>
                  )}
                </Link>
              </TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">
                {user.email || '–'}
              </TableCell>
              <TableCell className="text-right tabular-nums">{user.sessions}</TableCell>
              <TableCell className="hidden text-right tabular-nums sm:table-cell">
                {user.visits}
              </TableCell>
              <TableCell
                className="text-right whitespace-nowrap text-muted-foreground"
                title={user.lastSeen ? new Date(user.lastSeen).toLocaleString() : undefined}
              >
                {user.lastSeen
                  ? formatDistanceToNowStrict(new Date(user.lastSeen), { addSuffix: true })
                  : '–'}
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

export function UsersView() {
  const website = useCurrentWebsite();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.get('q') ?? '';
  const [value, setValue] = useState(search);

  // Keep the search in the URL (debounced), so a lookup can be bookmarked or pasted into a ticket.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = value.trim();
      if (next === search) return;

      const params = new URLSearchParams(searchParams);
      if (next) params.set('q', next);
      else params.delete('q');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [value, search, searchParams, pathname, router]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description={`People ${website.name} identified after they logged in. Find someone from a support ticket to see what they did.`}
      />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <InputGroup className="max-w-xl">
            <InputGroupInput
              autoFocus
              placeholder="Username, email or name"
              value={value}
              onChange={event => setValue(event.target.value)}
              aria-label="Search users"
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
          <UsersTable key={search} search={search} />
        </CardContent>
      </Card>
    </div>
  );
}
