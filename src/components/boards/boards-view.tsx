'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { LayoutDashboard, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  useBoard,
  useBoards,
  useCreateBoard,
  useDeleteBoard,
  useSaveBoard,
} from '@/hooks/queries/boards';
import type { BoardParameters } from '@/lib/types';
import { BoardCanvas } from './board-canvas';
import { BoardShareButton } from './board-share-button';

function NewBoardButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const create = useCreateBoard();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      const board = await create.mutateAsync({
        name: String(form.get('name')).trim(),
        description: String(form.get('description')).trim(),
      });
      setOpen(false);
      router.push(`/boards/${board.id}?edit=1`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the board.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          New board
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New board</DialogTitle>
            <DialogDescription>
              A custom dashboard mixing widgets from any of your websites, links and pixels.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="board-name">Name</FieldLabel>
              <Input
                id="board-name"
                name="name"
                required
                maxLength={100}
                autoFocus
                placeholder="Marketing"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="board-description">Description</FieldLabel>
              <Textarea id="board-description" name="description" maxLength={500} rows={2} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner data-icon="inline-start" />}
              Create board
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BoardsView() {
  const { data, isPending } = useBoards();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Boards"
        description="Custom dashboards across your websites, links and pixels."
      >
        <NewBoardButton />
      </PageHeader>
      {isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : !data?.data.length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutDashboard />
            </EmptyMedia>
            <EmptyTitle>No boards yet</EmptyTitle>
            <EmptyDescription>
              Put the numbers you check every day on one page: stats, charts, goals and funnels.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <NewBoardButton />
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map(board => {
            const widgets = (board.parameters?.rows ?? []).reduce(
              (sum, row) => sum + row.columns.length,
              0,
            );

            return (
              <Link key={board.id} href={`/boards/${board.id}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary/50">
                  <CardHeader>
                    <CardTitle>{board.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {board.description || 'No description'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground">
                    {widgets} {widgets === 1 ? 'widget' : 'widgets'} · updated{' '}
                    {formatDistanceToNowStrict(new Date(board.updatedAt ?? board.createdAt), {
                      addSuffix: true,
                    })}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A board with view and edit modes; edits are kept locally until saved. */
export function BoardDetail({
  boardId,
  startEditing,
}: {
  boardId: string;
  startEditing?: boolean;
}) {
  const router = useRouter();
  const { data: board, isPending, error } = useBoard(boardId);
  const save = useSaveBoard(boardId);
  const remove = useDeleteBoard();
  const [draft, setDraft] = useState<{
    name: string;
    description: string;
    parameters: BoardParameters;
  } | null>(null);
  const [wantsEdit, setWantsEdit] = useState(!!startEditing);

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !board) return <p className="text-sm text-muted-foreground">Board not found.</p>;

  const editing = wantsEdit;
  const current = draft ?? {
    name: board.name,
    description: board.description,
    parameters: board.parameters ?? { rows: [] },
  };

  async function handleSave() {
    try {
      await save.mutateAsync(current);
      toast.success('Board saved');
      setDraft(null);
      setWantsEdit(false);
      if (startEditing) router.replace(`/boards/${boardId}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the board.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {editing ? (
          <div className="flex w-full max-w-xl flex-col gap-2">
            <Input
              value={current.name}
              onChange={event => setDraft({ ...current, name: event.target.value })}
              className="text-lg font-semibold"
              aria-label="Board name"
              maxLength={100}
            />
            <Textarea
              value={current.description}
              onChange={event => setDraft({ ...current, description: event.target.value })}
              rows={2}
              placeholder="Description"
              aria-label="Board description"
              maxLength={500}
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href="/boards"
              className="w-fit text-sm text-muted-foreground hover:text-foreground"
            >
              Boards
            </Link>
            <h1 className="truncate text-2xl font-semibold tracking-tight">{board.name}</h1>
            {board.description && (
              <p className="text-sm text-muted-foreground">{board.description}</p>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Delete board">
                    <Trash2 />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {board.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Only the board is deleted; your analytics data isn&apos;t affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={async () => {
                        await remove.mutateAsync(board.id);
                        toast.success('Board deleted');
                        router.push('/boards');
                      }}
                    >
                      Delete board
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(null);
                  setWantsEdit(false);
                }}
              >
                <X data-icon="inline-start" />
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={save.isPending || !current.name.trim()}>
                {save.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Save data-icon="inline-start" />
                )}
                Save
              </Button>
            </>
          ) : (
            <>
              <DateRangePicker />
              <BoardShareButton boardId={board.id} name={board.name} />
              <Button variant="outline" onClick={() => setWantsEdit(true)}>
                <Pencil data-icon="inline-start" />
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {!editing && !(current.parameters.rows ?? []).length ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LayoutDashboard />
            </EmptyMedia>
            <EmptyTitle>This board is empty</EmptyTitle>
            <EmptyDescription>Edit it to add rows and widgets.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setWantsEdit(true)}>
              <Pencil data-icon="inline-start" />
              Edit board
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <BoardCanvas
          parameters={current.parameters}
          editing={editing}
          onChange={parameters => setDraft({ ...current, parameters })}
        />
      )}
    </div>
  );
}
