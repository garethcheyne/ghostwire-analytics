'use client';
import { Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { type Share, useDeleteShare, useSaveShare, useWebsiteShares } from '@/hooks/queries/shares';
import { useCurrentWebsite } from '../website-context';

// Sections a share link can expose (same ids as Umami's share parameters).
const SECTIONS: { title: string; items: { id: string; label: string }[] }[] = [
  {
    title: 'Traffic',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'events', label: 'Events' },
      { id: 'sessions', label: 'Sessions' },
      { id: 'realtime', label: 'Realtime' },
      { id: 'performance', label: 'Performance' },
      { id: 'compare', label: 'Compare' },
      { id: 'breakdown', label: 'Breakdown' },
    ],
  },
  {
    title: 'Behavior',
    items: [
      { id: 'goals', label: 'Goals' },
      { id: 'funnels', label: 'Funnels' },
      { id: 'journeys', label: 'Journeys' },
      { id: 'retention', label: 'Retention' },
    ],
  },
  {
    title: 'Growth',
    items: [
      { id: 'utm', label: 'UTM' },
      { id: 'revenue', label: 'Revenue' },
      { id: 'attribution', label: 'Attribution' },
    ],
  },
];

function shareUrl(slug: string) {
  return `${window.location.origin}${process.env.basePath ?? ''}/share/${slug}`;
}

function ShareDialog({
  share,
  open,
  onOpenChange,
}: {
  share?: Share;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const website = useCurrentWebsite();
  const saveShare = useSaveShare(website.id);
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      SECTIONS.flatMap(section =>
        section.items.map(({ id }) => [id, share ? share.parameters[id] === true : id === 'overview']),
      ),
    ),
  );
  const [allowFilter, setAllowFilter] = useState(share?.parameters.allowFilter !== false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name')).trim();

    try {
      await saveShare.mutateAsync({ share, name, parameters: { ...selected, allowFilter } });
      toast.success(share ? 'Share link updated' : 'Share link created');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the share link.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{share ? 'Edit share link' : 'New share link'}</DialogTitle>
            <DialogDescription>
              Anyone with the link can view the sections you choose, without signing in.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="share-name">Name</FieldLabel>
              <Input
                id="share-name"
                name="name"
                defaultValue={share?.name ?? 'Public dashboard'}
                maxLength={200}
                required
              />
            </Field>
            {SECTIONS.map(section => (
              <FieldSet key={section.title}>
                <FieldLegend variant="label">{section.title}</FieldLegend>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {section.items.map(({ id, label }) => (
                    <Field key={id} orientation="horizontal">
                      <Checkbox
                        id={`share-${id}`}
                        checked={selected[id]}
                        onCheckedChange={checked =>
                          setSelected(current => ({ ...current, [id]: checked === true }))
                        }
                      />
                      <FieldLabel htmlFor={`share-${id}`} className="font-normal">
                        {label}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
              </FieldSet>
            ))}
            <Field orientation="horizontal">
              <Checkbox
                id="share-filters"
                checked={allowFilter}
                onCheckedChange={checked => setAllowFilter(checked === true)}
              />
              <FieldLabel htmlFor="share-filters" className="font-normal">
                Let viewers filter the data
              </FieldLabel>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saveShare.isPending}>
              {saveShare.isPending && <Spinner data-icon="inline-start" />}
              {share ? 'Save' : 'Create link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteShareButton({ share }: { share: Share }) {
  const website = useCurrentWebsite();
  const deleteShare = useDeleteShare(website.id);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${share.name}`}>
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete share link?</AlertDialogTitle>
          <AlertDialogDescription>
            Anyone using “{share.name}” will lose access. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              deleteShare.mutate(share.id, {
                onSuccess: () => toast.success('Share link deleted'),
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function SharingSettings() {
  const website = useCurrentWebsite();
  const { data, isPending } = useWebsiteShares(website.id);
  const [editing, setEditing] = useState<Share | 'new' | null>(null);
  const shares = data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share links</CardTitle>
        <CardDescription>Public, read-only links to this website&apos;s dashboard.</CardDescription>
        {website.canUpdate && (
          <CardAction>
            <Button variant="outline" onClick={() => setEditing('new')}>
              <Plus data-icon="inline-start" />
              New link
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : shares.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Link2 />
              </EmptyMedia>
              <EmptyTitle>Not shared</EmptyTitle>
              <EmptyDescription>Only people with access to this website can see it.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {shares.map(share => (
              <li key={share.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="w-40 shrink-0 truncate text-sm font-medium">{share.name}</span>
                <InputGroup className="flex-1">
                  <InputGroupInput value={shareUrl(share.slug)} readOnly className="font-mono text-xs" />
                  <InputGroupAddon align="inline-end">
                    <CopyButton value={shareUrl(share.slug)} label="Copy share link" />
                  </InputGroupAddon>
                </InputGroup>
                {website.canUpdate && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit ${share.name}`}
                      onClick={() => setEditing(share)}
                    >
                      <Pencil />
                    </Button>
                    <DeleteShareButton share={share} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {editing && (
        <ShareDialog
          key={editing === 'new' ? 'new' : editing.id}
          share={editing === 'new' ? undefined : editing}
          open
          onOpenChange={open => !open && setEditing(null)}
        />
      )}
    </Card>
  );
}
