'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ScrollText, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api-client';

interface AuditRow {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  websiteId: string | null;
  websiteName: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

const CATEGORIES = [
  { value: 'all', label: 'Everything' },
  { value: 'auth', label: 'Sign-ins and security' },
  { value: 'admin', label: 'Administration' },
  { value: 'user', label: 'Users' },
  { value: 'team', label: 'Teams' },
  { value: 'website', label: 'Websites' },
  { value: 'share', label: 'Share links' },
  { value: 'support-link', label: 'Support links' },
  { value: 'api-key', label: 'API keys' },
];

const PAGE_SIZE = 50;

function describeDetails(details: Record<string, unknown> | null) {
  if (!details) return '';
  return Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(' · ');
}

export function AdminAudit() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());

  const { data, isPending } = useQuery({
    queryKey: ['admin', 'audit', deferredSearch, category, page],
    queryFn: () =>
      api.get<{ data: AuditRow[]; count: number }>('/admin/audit', {
        search: deferredSearch || undefined,
        category: category === 'all' ? undefined : category,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  });
  const pageCount = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Audit log"
        description="Sign-ins, security changes and admin actions, newest first."
      >
        <Select
          value={category}
          onValueChange={value => {
            setCategory(value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {CATEGORIES.map(item => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <InputGroup className="w-60">
          <InputGroupInput
            placeholder="User, action, target or IP"
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Search the audit log"
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
      </PageHeader>

      <Card>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : !data?.data.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ScrollText />
                </EmptyMedia>
                <EmptyTitle>Nothing logged</EmptyTitle>
                <EmptyDescription>Try another search or category.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="hidden lg:table-cell">Details</TableHead>
                  <TableHead className="hidden text-right md:table-cell">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map(row => {
                  const details = describeDetails(row.details);
                  const failed = row.action.endsWith('.failed');

                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {format(new Date(row.createdAt), 'd MMM, HH:mm:ss')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {row.username ?? <span className="text-muted-foreground">–</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant={failed ? 'destructive' : 'secondary'}
                            className="font-mono"
                          >
                            {row.action}
                          </Badge>
                          {row.websiteName && (
                            <span className="text-xs text-muted-foreground">{row.websiteName}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden max-w-0 w-full lg:table-cell">
                        {details && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate text-xs text-muted-foreground">
                                {details}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-md break-all">
                              {details}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono text-xs text-muted-foreground md:table-cell">
                        {row.ip ?? '–'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2 text-sm text-muted-foreground">
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
        </CardContent>
      </Card>
    </div>
  );
}
