'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Search, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldTitle } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, type PageResult } from '@/lib/api-client';

function useAdminList<T>(path: string, search: string, page: number) {
  return useQuery({
    queryKey: ['admin', path, search, page],
    queryFn: () => api.get<PageResult<T>>(`/admin/${path}`, { search, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
}

function ListCard<T>({
  path,
  placeholder,
  columns,
  row,
}: {
  path: string;
  placeholder: string;
  columns: React.ReactNode;
  row: (item: T) => React.ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const { data, isPending } = useAdminList<T>(path, deferredSearch, page);
  const pageCount = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <InputGroup className="max-w-sm">
          <InputGroupInput
            placeholder={placeholder}
            value={search}
            onChange={event => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label={placeholder}
          />
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
        </InputGroup>
        {isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : !data?.data.length ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nothing found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>{columns}</TableRow>
            </TableHeader>
            <TableBody>{data.data.map(row)}</TableBody>
          </Table>
        )}
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
      </CardContent>
    </Card>
  );
}

interface AdminWebsite {
  id: string;
  name: string;
  domain: string | null;
  createdAt: string;
  user: { id: string; username: string | null } | null;
  team: { id: string; name: string } | null;
}

export function AdminWebsites() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Websites" description="Every website on this Ghostwire." />
      <ListCard<AdminWebsite>
        path="websites"
        placeholder="Search websites"
        columns={
          <>
            <TableHead>Website</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="hidden text-right md:table-cell">Created</TableHead>
          </>
        }
        row={website => (
          <TableRow key={website.id}>
            <TableCell>
              <Link href={`/websites/${website.id}`} className="flex flex-col hover:underline">
                <span className="font-medium">{website.name}</span>
                <span className="text-xs text-muted-foreground">{website.domain}</span>
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {website.team ? (
                <Link href={`/settings/teams/${website.team.id}`} className="hover:underline">
                  Team: {website.team.name}
                </Link>
              ) : (
                (website.user?.username ?? '–')
              )}
            </TableCell>
            <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground md:table-cell">
              {formatDistanceToNowStrict(new Date(website.createdAt), { addSuffix: true })}
            </TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}

interface AdminTeam {
  id: string;
  name: string;
  createdAt: string;
  twoFactorRequired: boolean;
  members: { role: string; user: { username: string | null } }[];
  _count: { websites: number; members: number };
}

export function AdminTeams() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Teams" description="Every team on this Ghostwire." />
      <ListCard<AdminTeam>
        path="teams"
        placeholder="Search teams"
        columns={
          <>
            <TableHead>Team</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead className="text-right">Members</TableHead>
            <TableHead className="text-right">Websites</TableHead>
          </>
        }
        row={team => (
          <TableRow key={team.id}>
            <TableCell>
              <Link href={`/settings/teams/${team.id}`} className="font-medium hover:underline">
                {team.name}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {team.members.find(member => member.role === 'owner')?.user.username ?? '–'}
            </TableCell>
            <TableCell className="text-right tabular-nums">{team._count.members}</TableCell>
            <TableCell className="text-right tabular-nums">{team._count.websites}</TableCell>
          </TableRow>
        )}
      />
    </div>
  );
}

interface AdminUserSummary {
  id: string;
  username: string | null;
  name: string;
  twoFactorEnabled: boolean | null;
}

export function AdminSecurity() {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<{ requireTwoFactor: boolean }>('/admin/settings'),
  });
  const { data: users } = useQuery({
    queryKey: ['admin', 'users', 'all'],
    queryFn: () => api.get<PageResult<AdminUserSummary>>('/admin/users', { pageSize: 500 }),
  });
  const update = useMutation({
    mutationFn: (requireTwoFactor: boolean) => api.post('/admin/settings', { requireTwoFactor }),
    onSuccess: (_, requireTwoFactor) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success(
        requireTwoFactor
          ? 'Two-factor is now required for everyone'
          : 'Two-factor is no longer required for everyone',
      );
    },
    onError: error => toast.error(error.message),
  });
  const withoutTwoFactor = (users?.data ?? []).filter(user => !user.twoFactorEnabled);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Security" description="Sign-in rules for everyone." />
      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
          <CardDescription>
            You can also require it for one user (Users) or for a team&apos;s members (the
            team&apos;s settings).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!settings ? (
            <Skeleton className="h-12 w-full max-w-2xl" />
          ) : (
            <Field orientation="horizontal" className="max-w-2xl">
              <FieldContent>
                <FieldTitle>Require for everyone</FieldTitle>
                <FieldDescription>
                  Users without it are sent to set it up the next time they open Ghostwire.
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={settings.requireTwoFactor}
                onCheckedChange={value => update.mutate(value)}
                disabled={update.isPending}
                aria-label="Require two-factor for everyone"
              />
            </Field>
          )}
          {withoutTwoFactor.length > 0 && (
            <Alert>
              <ShieldAlert />
              <AlertTitle>
                {withoutTwoFactor.length}{' '}
                {withoutTwoFactor.length === 1 ? 'user has' : 'users have'} not set up two-factor
              </AlertTitle>
              <AlertDescription>
                {withoutTwoFactor
                  .slice(0, 20)
                  .map(user => user.username ?? user.name)
                  .join(', ')}
                {withoutTwoFactor.length > 20 && '…'}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
