'use client';
import { ChartPie, MoreHorizontal, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { FIELDS } from '@/components/analytics/fields';
import { FILTER_OPERATORS, type FilterRow, FilterRows, emptyFilter } from '@/components/analytics/filter-rows';
import { formatMetricLabel } from '@/components/analytics/metric-labels';
import { WebsiteHeader } from '@/components/analytics/website-header';
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
import { Card, CardContent } from '@/components/ui/card';
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
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCurrentWebsite } from '@/components/websites/website-context';
import {
  type Segment,
  type SegmentType,
  useDeleteSegment,
  useSaveSegment,
  useSegments,
} from '@/hooks/queries/segments';
import { useFilters } from '@/hooks/use-filters';
import { TargetInput, type TargetType } from './target-input';

const COHORT_RANGES = [
  { value: '7day', label: 'Last 7 days' },
  { value: '30day', label: 'Last 30 days' },
  { value: '90day', label: 'Last 90 days' },
  { value: '0month', label: 'This month' },
  { value: '0year', label: 'This year' },
];

const COPY = {
  segment: {
    title: 'Segments',
    singular: 'segment',
    icon: ChartPie,
    intro: 'Saved sets of filters you can apply to any report.',
    empty: 'For example: visitors from New Zealand on mobile.',
    param: 'segment',
  },
  cohort: {
    title: 'Cohorts',
    singular: 'cohort',
    icon: UserPlus,
    intro: 'Groups of visitors defined by something they did, e.g. everyone who signed up this month.',
    empty: 'For example: visitors who triggered “signup” in the last 30 days.',
    param: 'cohort',
  },
} as const;

function describeFilters(filters: FilterRow[] = []) {
  return filters
    .map(filter => {
      const field = FIELDS.find(f => f.name === filter.name)?.label ?? filter.name;
      const op = FILTER_OPERATORS.find(o => o.value === filter.operator)?.label ?? filter.operator;
      return `${field} ${op} ${formatMetricLabel(filter.name, filter.value)}`;
    })
    .join(', ');
}

function SegmentDialog({
  websiteId,
  type,
  segment,
  onOpenChange,
}: {
  websiteId: string;
  type: SegmentType;
  segment?: Segment;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveSegment(websiteId, type);
  const { filters: activeFilters } = useFilters();
  const [name, setName] = useState(segment?.name ?? '');
  const [match, setMatch] = useState<'all' | 'any'>(segment?.parameters.match ?? 'all');
  const [filters, setFilters] = useState<FilterRow[]>(
    segment?.parameters.filters ??
      (activeFilters.length
        ? activeFilters.map(({ name, operator, value }) => ({ name, operator, value }))
        : type === 'segment'
          ? [emptyFilter()]
          : []),
  );
  const [actionType, setActionType] = useState<TargetType>(
    (segment?.parameters.action?.type as TargetType) ?? 'path',
  );
  const [actionValue, setActionValue] = useState(segment?.parameters.action?.value ?? '');
  const [dateRange, setDateRange] = useState(segment?.parameters.dateRange ?? '30day');
  const copy = COPY[type];

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const cleaned = filters.filter(filter => filter.value.trim());

    if (type === 'segment' && !cleaned.length) {
      toast.error('Add at least one filter.');
      return;
    }

    try {
      await save.mutateAsync({
        id: segment?.id,
        name: name.trim(),
        parameters:
          type === 'segment'
            ? { filters: cleaned, match }
            : {
                filters: cleaned,
                match,
                dateRange,
                action: { type: actionType, value: actionValue.trim() },
              },
      });
      toast.success(segment ? `${name} saved` : `${name} added`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Could not save the ${copy.singular}.`);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{segment ? `Edit ${copy.singular}` : `Add ${copy.singular}`}</DialogTitle>
            <DialogDescription>{copy.intro}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="segment-name">Name</FieldLabel>
              <Input
                id="segment-name"
                value={name}
                onChange={event => setName(event.target.value)}
                maxLength={200}
                required
              />
            </Field>
            {type === 'cohort' && (
              <>
                <Field>
                  <FieldLabel htmlFor="cohort-action">Visitors who…</FieldLabel>
                  <TargetInput
                    id="cohort-action"
                    websiteId={websiteId}
                    type={actionType}
                    value={actionValue}
                    onTypeChange={setActionType}
                    onValueChange={setActionValue}
                  />
                </Field>
                <Field>
                  <FieldLabel>During</FieldLabel>
                  <Select value={dateRange} onValueChange={setDateRange}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {COHORT_RANGES.map(range => (
                          <SelectItem key={range.value} value={range.value}>
                            {range.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </>
            )}
            <FieldSet>
              <div className="flex items-center justify-between gap-2">
                <FieldLegend variant="label">{type === 'cohort' ? 'And matching (optional)' : 'Filters'}</FieldLegend>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={match}
                  onValueChange={value => value && setMatch(value as 'all' | 'any')}
                >
                  <ToggleGroupItem value="all">Match all</ToggleGroupItem>
                  <ToggleGroupItem value="any">Match any</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <FilterRows rows={filters} onChange={setFilters} />
            </FieldSet>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner data-icon="inline-start" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SegmentsView({ type }: { type: SegmentType }) {
  const { id, canUpdate } = useCurrentWebsite();
  const { data, isPending } = useSegments(id, type);
  const remove = useDeleteSegment(id, type);
  const [editing, setEditing] = useState<Segment | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Segment | null>(null);
  const copy = COPY[type];
  const Icon = copy.icon;
  const segments = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title={copy.title} />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">{copy.intro}</p>
        {canUpdate && (
          <Button onClick={() => setEditing('new')}>
            <Plus data-icon="inline-start" />
            Add {copy.singular}
          </Button>
        )}
      </div>

      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : segments.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>No {copy.title.toLowerCase()} yet</EmptyTitle>
            <EmptyDescription>{copy.empty}</EmptyDescription>
          </EmptyHeader>
          {canUpdate && (
            <EmptyContent>
              <Button onClick={() => setEditing('new')}>Add {copy.singular}</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Definition</TableHead>
                  <TableHead className="w-40 pr-4 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {segments.map(segment => {
                  const { action, dateRange, filters, match } = segment.parameters;
                  const definition = [
                    action?.value &&
                      `${action.type === 'path' ? 'Viewed' : 'Triggered'} ${action.value}${
                        dateRange ? ` (${COHORT_RANGES.find(r => r.value === dateRange)?.label ?? dateRange})` : ''
                      }`,
                    filters?.length ? `${match === 'any' ? 'Any of' : ''} ${describeFilters(filters)}`.trim() : null,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <TableRow key={segment.id}>
                      <TableCell className="pl-4 font-medium">{segment.name}</TableCell>
                      <TableCell className="max-w-lg truncate text-muted-foreground">{definition || '–'}</TableCell>
                      <TableCell className="pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/websites/${id}?${copy.param}=${segment.id}`}>Apply</Link>
                          </Button>
                          {canUpdate && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Actions for ${segment.name}`}>
                                  <MoreHorizontal />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuGroup>
                                  <DropdownMenuItem onSelect={() => setEditing(segment)}>
                                    <Pencil />
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(segment)}>
                                    <Trash2 />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuGroup>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {editing && (
        <SegmentDialog
          websiteId={id}
          type={type}
          segment={editing === 'new' ? undefined : editing}
          onOpenChange={open => !open && setEditing(null)}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={open => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>Only the saved definition is removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() =>
                deleting &&
                remove.mutate(deleting.id, { onSuccess: () => toast.success(`${deleting.name} deleted`) })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
