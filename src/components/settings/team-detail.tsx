'use client';
import { ArrowLeft, RefreshCw, Trash2, UserMinus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  generateAccessCode,
  useDeleteTeam,
  useRemoveMember,
  useSetMemberRole,
  useTeam,
  useTeamMembers,
  useUpdateTeam,
} from '@/hooks/queries/teams';
import { authClient } from '@/lib/auth-client';
import { TEAM_ROLE_RANK } from '@/lib/constants';
import { ROLE_LABELS } from './teams-settings';

const ASSIGNABLE_ROLES = ['manager', 'member', 'viewer'];

function Confirm({
  trigger,
  title,
  description,
  action,
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TeamDetail({ teamId }: { teamId: string }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const { data: team, isPending, error } = useTeam(teamId);
  const { data: members } = useTeamMembers(teamId);
  const updateTeam = useUpdateTeam(teamId);
  const deleteTeam = useDeleteTeam(teamId);
  const setRole = useSetMemberRole(teamId);
  const removeMember = useRemoveMember(teamId);
  const [name, setName] = useState<string | null>(null);

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !team) return <p className="text-sm text-muted-foreground">Team not found.</p>;

  const me = session?.user.id;
  const myRole = members?.data.find(member => member.userId === me)?.role ?? 'viewer';
  const myRank = TEAM_ROLE_RANK[myRole] ?? -1;
  const canManage = myRole === 'owner' || myRole === 'manager';
  const isOwner = myRole === 'owner';

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/settings/teams"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Teams
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{team.name}</h1>
      </div>

      {canManage && (
        <Card>
          <form
            className="flex flex-col gap-6"
            onSubmit={event => {
              event.preventDefault();
              if (name?.trim())
                run(() => updateTeam.mutateAsync({ name: name.trim() }), 'Team renamed');
            }}
          >
            <CardHeader>
              <CardTitle>Details</CardTitle>
              <CardDescription>
                Share the access code with people you want to join. Anyone with it can join as a
                member, so replace it if it leaks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="max-w-xl">
                <Field>
                  <FieldLabel htmlFor="team-name">Name</FieldLabel>
                  <Input
                    id="team-name"
                    value={name ?? team.name}
                    onChange={event => setName(event.target.value)}
                    maxLength={50}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="team-code">Access code</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id="team-code"
                      value={team.accessCode ?? ''}
                      readOnly
                      className="font-mono"
                    />
                    <InputGroupAddon align="inline-end">
                      {team.accessCode && <CopyButton value={team.accessCode} label="Copy code" />}
                    </InputGroupAddon>
                  </InputGroup>
                  <FieldDescription>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() =>
                        run(
                          () => updateTeam.mutateAsync({ accessCode: generateAccessCode() }),
                          'New access code created. The old one no longer works.',
                        )
                      }
                    >
                      <RefreshCw data-icon="inline-start" />
                      Replace code
                    </Button>
                  </FieldDescription>
                </Field>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldTitle>Require two-factor</FieldTitle>
                    <FieldDescription>
                      Members must set up two-factor authentication to use Ghostwire.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    checked={team.twoFactorRequired}
                    onCheckedChange={twoFactorRequired =>
                      run(
                        () => updateTeam.mutateAsync({ twoFactorRequired }),
                        twoFactorRequired
                          ? 'Members now need two-factor'
                          : 'Two-factor is no longer required',
                      )
                    }
                    disabled={updateTeam.isPending}
                    aria-label="Require two-factor for members"
                  />
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={updateTeam.isPending}>
                {updateTeam.isPending && <Spinner data-icon="inline-start" />}
                Save
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Owners and managers can change roles and remove members below their own role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!members ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.data.map(member => {
                  const editable =
                    canManage &&
                    member.userId !== me &&
                    (TEAM_ROLE_RANK[member.role] ?? -1) < myRank;

                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">
                        {member.user.username ?? member.user.name ?? member.userId}
                        {member.userId === me && (
                          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editable ? (
                          <Select
                            value={member.role}
                            onValueChange={role =>
                              run(
                                () => setRole.mutateAsync({ userId: member.userId, role }),
                                'Role changed',
                              )
                            }
                          >
                            <SelectTrigger size="sm" className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {ASSIGNABLE_ROLES.filter(role => TEAM_ROLE_RANK[role] < myRank).map(
                                  role => (
                                    <SelectItem key={role} value={role}>
                                      {ROLE_LABELS[role]}
                                    </SelectItem>
                                  ),
                                )}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="secondary">
                            {ROLE_LABELS[member.role] ?? member.role}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editable && (
                          <Confirm
                            trigger={
                              <Button variant="ghost" size="icon-sm" aria-label="Remove member">
                                <UserMinus />
                              </Button>
                            }
                            title={`Remove ${member.user.username ?? 'this member'}?`}
                            description="They lose access to the team's websites straight away."
                            action="Remove"
                            onConfirm={() =>
                              run(() => removeMember.mutateAsync(member.userId), 'Member removed')
                            }
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{isOwner ? 'Delete team' : 'Leave team'}</CardTitle>
          <CardDescription>
            {isOwner
              ? 'Deletes the team and its links, pixels and boards. Its websites move to your account, so no data is lost.'
              : "You'll lose access to the team's websites."}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          {isOwner ? (
            <Confirm
              trigger={
                <Button variant="destructive">
                  <Trash2 data-icon="inline-start" />
                  Delete team
                </Button>
              }
              title={`Delete ${team.name}?`}
              description="This can't be undone."
              action="Delete team"
              onConfirm={() =>
                run(async () => {
                  await deleteTeam.mutateAsync();
                  router.push('/settings/teams');
                }, 'Team deleted')
              }
            />
          ) : (
            <Confirm
              trigger={
                <Button variant="outline">
                  <UserMinus data-icon="inline-start" />
                  Leave team
                </Button>
              }
              title={`Leave ${team.name}?`}
              description="You'll need a new access code to rejoin."
              action="Leave"
              onConfirm={() =>
                run(async () => {
                  if (me) await removeMember.mutateAsync(me);
                  router.push('/settings/teams');
                }, 'You left the team')
              }
            />
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
