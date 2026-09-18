'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
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
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDeleteWebsite, useResetWebsite, websiteKeys } from '@/hooks/queries/websites';
import { api, type PageResult } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import { TEAM_ROLES } from '@/lib/auth-roles';
import { useCurrentWebsite } from '../website-context';

interface TeamWithMembers {
  id: string;
  name: string;
  members: { userId: string; role: string }[];
}

function TransferAction() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const website = useCurrentWebsite();
  const { data: session } = useSession();
  const userId = session?.user.id;
  const [teamId, setTeamId] = useState('');
  const isTeamWebsite = !!website.teamId;

  const { data: teams } = useQuery({
    queryKey: ['me', 'teams'],
    queryFn: () => api.get<PageResult<TeamWithMembers>>('/me/teams', { pageSize: 100 }),
    enabled: !isTeamWebsite,
  });

  // Teams you can move a website into: ones you own or manage.
  const targets = (teams?.data ?? []).filter(team =>
    team.members.some(
      member =>
        member.userId === userId &&
        [TEAM_ROLES.owner, TEAM_ROLES.manager].includes(member.role as 'owner' | 'manager'),
    ),
  );

  const transfer = useMutation({
    mutationFn: () =>
      api.post(`/websites/${website.id}/transfer`, isTeamWebsite ? { userId } : { teamId }),
    onSuccess: () => {
      toast.success(isTeamWebsite ? 'Moved to your websites' : 'Moved to the team');
      queryClient.invalidateQueries({ queryKey: websiteKeys.all });
      router.refresh();
    },
    onError: e => toast.error(e.message || 'Could not transfer the website.'),
  });

  return (
    <Item>
      <ItemContent>
        <ItemTitle>Transfer</ItemTitle>
        <ItemDescription>
          {isTeamWebsite
            ? 'Move this website out of the team and into your own websites.'
            : 'Move this website into a team you own or manage.'}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        {!isTeamWebsite && (
          <Select value={teamId} onValueChange={setTeamId} disabled={!targets.length}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder={targets.length ? 'Choose a team' : 'No teams'} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {targets.map(team => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          disabled={transfer.isPending || (!isTeamWebsite && !teamId)}
          onClick={() => transfer.mutate()}
        >
          Transfer
        </Button>
      </ItemActions>
    </Item>
  );
}

function ResetAction() {
  const website = useCurrentWebsite();
  const resetWebsite = useResetWebsite(website.id);

  return (
    <Item>
      <ItemContent>
        <ItemTitle>Reset data</ItemTitle>
        <ItemDescription>
          Delete all collected visits, events, replays and heatmaps. Settings and the tracking code
          stay the same.
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline">Reset</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset {website.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                All analytics data for this website will be permanently deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() =>
                  resetWebsite.mutate(undefined, {
                    onSuccess: () => toast.success('Website data reset'),
                    onError: e => toast.error(e.message),
                  })
                }
              >
                Reset data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ItemActions>
    </Item>
  );
}

function DeleteAction() {
  const router = useRouter();
  const website = useCurrentWebsite();
  const deleteWebsite = useDeleteWebsite(website.id);
  const [confirmation, setConfirmation] = useState('');

  return (
    <Item>
      <ItemContent>
        <ItemTitle>Delete website</ItemTitle>
        <ItemDescription>Remove the website and all of its data.</ItemDescription>
      </ItemContent>
      <ItemActions>
        <AlertDialog onOpenChange={() => setConfirmation('')}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {website.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                The website, its reports, share links and all collected data will be permanently
                deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <Field>
              <FieldLabel htmlFor="delete-confirm">
                Type <span className="font-mono">{website.name}</span> to confirm
              </FieldLabel>
              <Input
                id="delete-confirm"
                value={confirmation}
                onChange={event => setConfirmation(event.target.value)}
                autoComplete="off"
              />
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={confirmation !== website.name}
                onClick={() =>
                  deleteWebsite.mutate(undefined, {
                    onSuccess: () => {
                      toast.success(`${website.name} deleted`);
                      router.push('/websites');
                    },
                    onError: e => toast.error(e.message),
                  })
                }
              >
                Delete website
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ItemActions>
    </Item>
  );
}

export function DataSettings() {
  const website = useCurrentWebsite();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data</CardTitle>
        <CardDescription>Move this website or remove its data.</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup className="rounded-lg border">
          {website.canUpdate && (
            <>
              <TransferAction />
              <ItemSeparator />
              <ResetAction />
            </>
          )}
          {website.canDelete && (
            <>
              <ItemSeparator />
              <DeleteAction />
            </>
          )}
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
