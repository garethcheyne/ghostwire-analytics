'use client';
import { LogIn, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { useCreateTeam, useJoinTeam, useMyTeams } from '@/hooks/queries/teams';
import { authClient } from '@/lib/auth-client';

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  member: 'Member',
  viewer: 'Viewer',
};

function TeamDialog({ mode }: { mode: 'create' | 'join' }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateTeam();
  const join = useJoinTeam();
  const pending = create.isPending || join.isPending;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('value')).trim();
    setError(null);

    try {
      if (mode === 'create') {
        await create.mutateAsync(value);
        toast.success(`Team “${value}” created`);
      } else {
        await join.mutateAsync(value);
        toast.success('Joined the team');
      }
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        setOpen(value);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        {mode === 'create' ? (
          <Button>
            <Plus data-icon="inline-start" />
            New team
          </Button>
        ) : (
          <Button variant="outline">
            <LogIn data-icon="inline-start" />
            Join a team
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? 'New team' : 'Join a team'}</DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Share websites with other people. You become its owner.'
                : "Enter the access code from the team's settings."}
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="team-value">
              {mode === 'create' ? 'Name' : 'Access code'}
            </FieldLabel>
            <Input
              id="team-value"
              name="value"
              required
              maxLength={50}
              autoFocus
              className={mode === 'join' ? 'font-mono' : undefined}
              placeholder={mode === 'create' ? 'Marketing' : 'team_…'}
              aria-invalid={!!error || undefined}
            />
            {mode === 'join' && (
              <FieldDescription>
                You join as a member; an owner can change your role.
              </FieldDescription>
            )}
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {mode === 'create' ? 'Create team' : 'Join'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamsSettings() {
  const { data, isPending } = useMyTeams();
  const { data: session } = authClient.useSession();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Teams" description="Teams share websites, links and pixels.">
        <TeamDialog mode="join" />
        <TeamDialog mode="create" />
      </PageHeader>
      <Card>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : !data?.data.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>No teams yet</EmptyTitle>
                <EmptyDescription>
                  Create a team to share websites, or join one with an access code.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Team</TableHead>
                  <TableHead>Your role</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Websites</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map(team => {
                  const role = team.members.find(m => m.userId === session?.user.id)?.role;

                  return (
                    <TableRow key={team.id}>
                      <TableCell>
                        <Link
                          href={`/settings/teams/${team.id}`}
                          className="font-medium hover:underline"
                        >
                          {team.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {role && <Badge variant="secondary">{ROLE_LABELS[role] ?? role}</Badge>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {team._count.members}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {team._count.websites}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
