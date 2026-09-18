'use client';
import { format } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { ArrowLeft, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  type Annotation,
  useAnnotations,
  useDeleteAnnotation,
  useSaveAnnotation,
} from '@/hooks/queries/annotations';
import { useDateRange } from '@/hooks/use-date-range';
import { getAnnotationDateRangeValue } from '@/lib/annotations';

/** How a note's date reads in the viewer's timezone. */
export function formatAnnotationDate(annotation: Annotation, timezone: string) {
  const date = toZonedTime(annotation.date, timezone);
  return format(date, annotation.allDay ? 'EEE d MMM yyyy' : 'EEE d MMM yyyy, h:mm a');
}

/** Returns a callback that zooms the dashboard to a note's day (or hour). */
export function useShowAnnotation() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { timezone } = useDateRange();

  return (annotation: Annotation) => {
    const params = new URLSearchParams(searchParams);
    params.set(
      'date',
      getAnnotationDateRangeValue(toZonedTime(annotation.date, timezone), annotation.allDay),
    );
    params.delete('offset');
    params.delete('unit');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
}

function AnnotationForm({ annotation, onDone }: { annotation?: Annotation; onDone: () => void }) {
  const website = useCurrentWebsite();
  const { timezone } = useDateRange();
  const save = useSaveAnnotation(website.id);
  const initial = toZonedTime(annotation?.date ?? new Date(), timezone);
  const [day, setDay] = useState(format(initial, 'yyyy-MM-dd'));
  const [time, setTime] = useState(
    annotation?.allDay === false ? format(initial, 'HH:mm') : '09:00',
  );
  const [allDay, setAllDay] = useState(annotation?.allDay ?? true);
  const [note, setNote] = useState(annotation?.note ?? '');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();

    // The date and time are wall-clock values in the viewer's reporting timezone.
    const date = fromZonedTime(`${day}T${allDay ? '00:00' : time}:00`, timezone);

    save.mutate(
      { id: annotation?.id, date, allDay, note: note.trim() },
      {
        onSuccess: () => {
          toast.success(annotation ? 'Note updated' : 'Note added');
          onDone();
        },
        onError: error => toast.error(error.message),
      },
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="annotation-date">Date</FieldLabel>
            <Input
              id="annotation-date"
              type="date"
              required
              value={day}
              onChange={event => setDay(event.target.value)}
            />
          </Field>
          <Field data-disabled={allDay || undefined}>
            <FieldLabel htmlFor="annotation-time">Time</FieldLabel>
            <Input
              id="annotation-time"
              type="time"
              disabled={allDay}
              value={time}
              onChange={event => setTime(event.target.value)}
            />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Switch id="annotation-all-day" checked={allDay} onCheckedChange={setAllDay} />
          <FieldLabel htmlFor="annotation-all-day">All day</FieldLabel>
        </Field>
        <Field>
          <FieldLabel htmlFor="annotation-note">Note</FieldLabel>
          <Textarea
            id="annotation-note"
            required
            maxLength={500}
            rows={3}
            placeholder="Launched the new pricing page"
            value={note}
            onChange={event => setNote(event.target.value)}
          />
          <FieldDescription>
            Shown on the traffic chart. Times are in {timezone.replace(/_/g, ' ')}.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || !note.trim()}>
          {annotation ? 'Save' : 'Add note'}
        </Button>
      </DialogFooter>
    </form>
  );
}

type View = { mode: 'list' } | { mode: 'add' } | { mode: 'edit'; annotation: Annotation };

/** "Notes" button with a dialog to list, add, edit and delete chart annotations. */
export function AnnotationsDialog() {
  const website = useCurrentWebsite();
  const { params, timezone } = useDateRange();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ mode: 'list' });
  const [scope, setScope] = useState<'range' | 'all'>('range');
  const { data, isPending } = useAnnotations(
    website.id,
    scope === 'range' ? { startAt: params.startAt, endAt: params.endAt } : {},
  );
  const remove = useDeleteAnnotation(website.id);
  const show = useShowAnnotation();
  const notes = data?.data ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        setOpen(value);
        if (value) setView({ mode: 'list' });
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <StickyNote data-icon="inline-start" />
          Notes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view.mode !== 'list' && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setView({ mode: 'list' })}
                aria-label="Back to notes"
              >
                <ArrowLeft />
              </Button>
            )}
            {view.mode === 'add' ? 'Add note' : view.mode === 'edit' ? 'Edit note' : 'Notes'}
          </DialogTitle>
          <DialogDescription>
            Mark releases, campaigns and incidents so traffic changes have context.
          </DialogDescription>
        </DialogHeader>

        {view.mode !== 'list' ? (
          <AnnotationForm
            annotation={view.mode === 'edit' ? view.annotation : undefined}
            onDone={() => setView({ mode: 'list' })}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={scope}
                onValueChange={value => value && setScope(value as 'range' | 'all')}
              >
                <ToggleGroupItem value="range">This period</ToggleGroupItem>
                <ToggleGroupItem value="all">All notes</ToggleGroupItem>
              </ToggleGroup>
              {website.canUpdate && (
                <Button size="sm" onClick={() => setView({ mode: 'add' })}>
                  <Plus data-icon="inline-start" />
                  Add note
                </Button>
              )}
            </div>

            {isPending ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : notes.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <StickyNote />
                  </EmptyMedia>
                  <EmptyTitle>No notes</EmptyTitle>
                  <EmptyDescription>
                    {scope === 'range'
                      ? 'Nothing noted in this period.'
                      : 'No notes for this website yet.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ScrollArea className="max-h-96">
                <ItemGroup className="gap-2">
                  {notes.map(annotation => (
                    <Item key={annotation.id} variant="outline" size="sm">
                      <ItemContent>
                        <button
                          type="button"
                          className="flex flex-col gap-1 text-left"
                          onClick={() => {
                            show(annotation);
                            setOpen(false);
                          }}
                        >
                          <ItemDescription>
                            {formatAnnotationDate(annotation, timezone)}
                          </ItemDescription>
                          <ItemTitle className="whitespace-pre-wrap">{annotation.note}</ItemTitle>
                        </button>
                      </ItemContent>
                      {website.canUpdate && (
                        <ItemActions>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Edit note"
                            onClick={() => setView({ mode: 'edit', annotation })}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Delete note"
                            disabled={remove.isPending}
                            onClick={() =>
                              remove.mutate(annotation.id, {
                                onSuccess: () => toast.success('Note deleted'),
                                onError: error => toast.error(error.message),
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        </ItemActions>
                      )}
                    </Item>
                  ))}
                </ItemGroup>
              </ScrollArea>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
