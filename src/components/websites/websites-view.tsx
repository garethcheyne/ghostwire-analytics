'use client';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Globe, MoreHorizontal, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useWebsites, type Website } from '@/hooks/queries/websites';
import { useActiveTeam } from '@/hooks/use-active-team';
import { api } from '@/lib/api-client';
import { AddWebsiteDialog } from './add-website-dialog';
import { WebsiteSparkline } from './website-sparkline';

const PAGE_SIZE = 20;

interface ChartData {
  data: Record<string, { values: number[]; total: number }>;
}

function useWebsiteCharts(websites: Website[]) {
  const ids = websites.map(website => website.id);

  return useQuery({
    queryKey: ['websites', 'charts', ids],
    queryFn: () =>
      api.get<ChartData>('/websites/charts', {
        ids: ids.join(','),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    enabled: ids.length > 0,
  });
}

export function WebsitesView() {
  const { team } = useActiveTeam();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const { data, isPending } = useWebsites({ search: deferredSearch, page, pageSize: PAGE_SIZE });
  const websites = data?.data ?? [];
  const { data: charts } = useWebsiteCharts(websites);
  const pageCount = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Websites"
        description={team ? `Websites shared with ${team.name}.` : 'Websites you track.'}
      >
        <AddWebsiteDialog />
      </PageHeader>

      <InputGroup className="max-w-sm">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search websites"
          value={search}
          onChange={event => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </InputGroup>

      {isPending ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            {[0, 1, 2].map(row => (
              <Skeleton key={row} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : websites.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Globe />
            </EmptyMedia>
            <EmptyTitle>{search ? 'No matching websites' : 'No websites yet'}</EmptyTitle>
            <EmptyDescription>
              {search
                ? 'Try a different search.'
                : 'Add a website to get its tracking snippet and start collecting visits.'}
            </EmptyDescription>
          </EmptyHeader>
          {!search && (
            <EmptyContent>
              <AddWebsiteDialog />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Domain</TableHead>
                <TableHead className="hidden sm:table-cell">Last 7 days</TableHead>
                <TableHead className="text-right">Visitors</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {websites.map(website => {
                const chart = charts?.data[website.id];

                return (
                  <TableRow key={website.id}>
                    <TableCell className="font-medium">
                      <Link href={`/websites/${website.id}`} className="hover:text-primary">
                        {website.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {website.domain}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {chart ? (
                        <WebsiteSparkline values={chart.values} />
                      ) : (
                        <Skeleton className="h-8 w-28" />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {chart ? chart.total.toLocaleString() : '–'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${website.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuItem asChild>
                              <Link href={`/websites/${website.id}`}>
                                <BarChart3 />
                                View analytics
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/websites/${website.id}/settings`}>
                                <Settings />
                                Settings
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

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
