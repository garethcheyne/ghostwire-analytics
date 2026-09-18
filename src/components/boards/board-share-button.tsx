'use client';
import { Link2, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
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
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useBoardShares, useCreateBoardShare, useDeleteBoardShare } from '@/hooks/queries/shares';

function shareUrl(slug: string) {
  return `${window.location.origin}${process.env.basePath ?? ''}/share/${slug}`;
}

/** Turns a public, read-only link to a board on or off. */
export function BoardShareButton({ boardId, name }: { boardId: string; name: string }) {
  const { data, isPending } = useBoardShares(boardId);
  const create = useCreateBoardShare(boardId);
  const remove = useDeleteBoardShare(boardId);
  const share = data?.data[0];

  async function run(action: () => Promise<unknown>, message: string) {
    try {
      await action();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : message);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 data-icon="inline-start" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share {name}</DialogTitle>
          <DialogDescription>
            Anyone with the link can view this board, read-only. Widgets only show websites, links
            and pixels the board&apos;s owner can see.
          </DialogDescription>
        </DialogHeader>
        {isPending ? (
          <Skeleton className="h-9 w-full" />
        ) : share ? (
          <InputGroup>
            <InputGroupAddon>
              <Link2 />
            </InputGroupAddon>
            <InputGroupInput readOnly value={shareUrl(share.slug)} aria-label="Share link" />
            <InputGroupAddon align="inline-end">
              <CopyButton value={shareUrl(share.slug)} label="Copy share link" />
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <p className="text-sm text-muted-foreground">Sharing is off.</p>
        )}
        <DialogFooter>
          {share ? (
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => run(() => remove.mutateAsync(share.id), 'Could not turn sharing off.')}
            >
              {remove.isPending && <Spinner data-icon="inline-start" />}
              Turn off sharing
            </Button>
          ) : (
            <Button
              disabled={create.isPending || isPending}
              onClick={() => run(() => create.mutateAsync(name), 'Could not create the link.')}
            >
              {create.isPending && <Spinner data-icon="inline-start" />}
              Create share link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
