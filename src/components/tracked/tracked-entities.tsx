'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Grid2x2,
  LinkIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useDeferredValue, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { WebsiteSparkline } from '@/components/websites/website-sparkline';
import { useActiveTeam } from '@/hooks/use-active-team';
import { api, type PageResult } from '@/lib/api-client';

export type TrackedKind = 'links' | 'pixels';

export interface TrackedEntity {
  id: string;
  name: string;
  slug: string;
  /** Links only: where the short link redirects to. */
  url?: string;
  userId: string | null;
  teamId: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;

export const KIND = {
  links: {
    title: 'Links',
    singular: 'link',
    description: 'Short links that redirect and count every click.',
    path: 'q',
    Icon: LinkIcon,
  },
  pixels: {
    title: 'Pixels',
    singular: 'pixel',
    description: 'Invisible images that count views in emails and pages you can’t add a script to.',
    path: 'p',
    Icon: Grid2x2,
  },
} as const;

const subscribe = () => () => {};

/** The public URL of a link (/q/slug) or pixel (/p/slug) on this server. */
export function useTrackedUrl(kind: TrackedKind, slug: string) {
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => '',
  );
  return `${origin}${process.env.basePath ?? ''}/${KIND[kind].path}/${slug}`;
}

/** A random slug: 10 characters, easy to read aloud (no 0/O, 1/l). */
function randomSlug() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from(
    crypto.getRandomValues(new Uint8Array(10)),
    byte => alphabet[byte % alphabet.length],
  ).join('');
}

function EntityDialog({
  kind,
  entity,
  open,
  onOpenChange,
}: {
  kind: TrackedKind;
  entity?: TrackedEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { teamId } = useActiveTeam();
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState(entity?.slug ?? randomSlug());
  const shortUrl = useTrackedUrl(kind, slug);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      entity ? api.post(`/${kind}/${entity.id}`, body) : api.post(`/${kind}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [kind] }),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);

    try {
      await save.mutateAsync({
        name: String(form.get('name')).trim(),
        slug: slug.trim(),
        ...(kind === 'links' && { url: String(form.get('url')).trim() }),
        ...(!entity && teamId && { teamId }),
      });
      toast.success(
        entity
          ? 'Saved'
          : `${KIND[kind].singular[0].toUpperCase()}${KIND[kind].singular.slice(1)} created`,
      );
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {entity ? `Edit ${KIND[kind].singular}` : `New ${KIND[kind].singular}`}
            </DialogTitle>
            <DialogDescription>{KIND[kind].description}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="entity-name">Name</FieldLabel>
              <Input
                id="entity-name"
                name="name"
                required
                maxLength={100}
                defaultValue={entity?.name}
                placeholder={kind === 'links' ? 'Spring newsletter' : 'Welcome email'}
                autoFocus
              />
            </Field>
            {kind === 'links' && (
              <Field>
                <FieldLabel htmlFor="entity-url">Destination</FieldLabel>
                <Input
                  id="entity-url"
                  name="url"
                  type="url"
                  required
                  maxLength={500}
                  defaultValue={entity?.url}
                  placeholder="https://example.com/pricing"
                />
              </Field>
            )}
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="entity-slug">Slug</FieldLabel>
              <Input
                id="entity-slug"
                value={slug}
                onChange={event => setSlug(event.target.value.replace(/[^\w-]/g, ''))}
                required
                minLength={8}
                maxLength={100}
                className="font-mono"
                aria-invalid={!!error || undefined}
              />
              <FieldDescription className="break-all">{shortUrl}</FieldDescription>
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner data-icon="inline-start" />}
              {entity ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShortUrl({ kind, slug }: { kind: TrackedKind; slug: string }) {
  const url = useTrackedUrl(kind, slug);

  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate font-mono text-xs text-muted-foreground">{url}</span>
      <CopyButton value={url} label="Copy URL" />
    </span>
  );
}

function EntityRow({
  kind,
  entity,
  chart,
}: {
  kind: TrackedKind;
  entity: TrackedEntity;
  chart?: { values: number[]; total: number };
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.del(`/${kind}/${entity.id}`),
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: [kind] });
    },
    onError: error => toast.error(error.message),
  });

  return (
    <TableRow>
      <TableCell className="max-w-0 w-full">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={`/${kind}/${entity.id}`} className="truncate font-medium hover:text-primary">
            {entity.name}
          </Link>
          {entity.url && (
            <span className="truncate text-xs text-muted-foreground">→ {entity.url}</span>
          )}
          <ShortUrl kind={kind} slug={entity.slug} />
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell">
        {chart ? <WebsiteSparkline values={chart.values} /> : <Skeleton className="h-8 w-28" />}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {chart ? chart.total.toLocaleString() : '–'}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${entity.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={`/${kind}/${entity.id}`}>
                  <BarChart3 />
                  View stats
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil />
                Edit
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        {editing && (
          <EntityDialog kind={kind} entity={entity} open={editing} onOpenChange={setEditing} />
        )}
        <AlertDialog open={deleting} onOpenChange={setDeleting}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{entity.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                {kind === 'links'
                  ? 'The short link stops redirecting and its stats are deleted.'
                  : 'The pixel stops counting and its stats are deleted.'}
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
      </TableCell>
    </TableRow>
  );
}

/** Links or pixels for the current context (active team or personal), with 7-day sparklines. */
export function TrackedEntitiesView({ kind }: { kind: TrackedKind }) {
  const { teamId, team, isPending: teamPending } = useActiveTeam();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());
  const { Icon, title, description, singular } = KIND[kind];

  const { data, isPending } = useQuery({
    queryKey: [kind, 'list', teamId, deferredSearch, page],
    queryFn: () =>
      api.get<PageResult<TrackedEntity>>(teamId ? `/teams/${teamId}/${kind}` : `/${kind}`, {
        search: deferredSearch,
        page,
        pageSize: PAGE_SIZE,
      }),
    enabled: !teamPending,
    placeholderData: keepPreviousData,
  });
  const items = data?.data ?? [];
  const ids = items.map(item => item.id);
  const { data: charts } = useQuery({
    queryKey: [kind, 'charts', ids],
    queryFn: () =>
      api.get<{ data: Record<string, { values: number[]; total: number }> }>(`/${kind}/charts`, {
        ids: ids.join(','),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    enabled: ids.length > 0,
  });
  const pageCount = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  const newButton = (
    <Button onClick={() => setCreating(true)}>
      <Plus data-icon="inline-start" />
      New {singular}
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={team ? `${title} shared with ${team.name}. ${description}` : description}
      >
        {newButton}
      </PageHeader>
      {creating && <EntityDialog kind={kind} open={creating} onOpenChange={setCreating} />}

      <InputGroup className="max-w-sm">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={`Search ${kind}`}
          value={search}
          onChange={event => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </InputGroup>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !items.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>{search ? `No matching ${kind}` : `No ${kind} yet`}</EmptyTitle>
            <EmptyDescription>{description}</EmptyDescription>
          </EmptyHeader>
          {!search && <EmptyContent>{newButton}</EmptyContent>}
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Last 7 days</TableHead>
                <TableHead className="text-right">
                  {kind === 'links' ? 'Clicks' : 'Views'}
                </TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => (
                <EntityRow key={item.id} kind={kind} entity={item} chart={charts?.data[item.id]} />
              ))}
            </TableBody>
          </Table>
        </Card>
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
    </div>
  );
}
