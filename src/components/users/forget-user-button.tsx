'use client';
import { UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useForgetUser } from '@/hooks/queries/users';

/** Erases everything recorded about the user (data-protection requests). Asks to type the ID. */
export function ForgetUserButton({ websiteId, userId }: { websiteId: string; userId: string }) {
  const router = useRouter();
  const forget = useForgetUser(websiteId);
  const [confirmation, setConfirmation] = useState('');

  async function handleForget() {
    try {
      const result = await forget.mutateAsync(userId);
      toast.success(
        `Forgot ${userId}: ${result.sessions} ${result.sessions === 1 ? 'session' : 'sessions'} and their data were erased.`,
      );
      router.push(`/websites/${websiteId}/users`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not erase the user.');
    }
  }

  return (
    <AlertDialog onOpenChange={() => setConfirmation('')}>
      <AlertDialogTrigger asChild>
        <Button variant="outline">
          <UserX data-icon="inline-start" />
          Forget user
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Forget {userId}?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently erases their visits, page views, events, replays, heatmap clicks, errors and
            support links on this website, for data-protection requests. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel htmlFor="forget-confirm">Type the user ID to confirm</FieldLabel>
          <Input
            id="forget-confirm"
            autoComplete="off"
            value={confirmation}
            onChange={event => setConfirmation(event.target.value)}
            placeholder={userId}
          />
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={confirmation !== userId || forget.isPending}
            onClick={handleForget}
          >
            {forget.isPending && <Spinner data-icon="inline-start" />}
            Forget user
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
