'use client';
import {
  Bell,
  Mail,
  MessageCircle,
  MessageSquare,
  Pencil,
  Plus,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
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
  type Channel,
  type ChannelType,
  useChannels,
  useDeleteChannel,
  useSaveChannel,
  useTestChannel,
} from '@/hooks/queries/alerts';
import { useActiveTeam } from '@/hooks/use-active-team';

export const CHANNEL_META: Record<
  ChannelType,
  { label: string; icon: typeof Mail; placeholder?: string; help: string }
> = {
  slack: {
    label: 'Slack',
    icon: MessageSquare,
    placeholder: 'https://hooks.slack.com/services/…',
    help: 'An incoming webhook URL (Slack app → Incoming Webhooks).',
  },
  discord: {
    label: 'Discord',
    icon: MessageCircle,
    placeholder: 'https://discord.com/api/webhooks/…',
    help: 'Channel settings → Integrations → Webhooks → Copy URL.',
  },
  webhook: {
    label: 'Webhook',
    icon: Webhook,
    placeholder: 'https://example.com/hooks/ghostwire',
    help: 'Receives a JSON POST: event, title, text, url, fields, data.',
  },
  email: { label: 'Email', icon: Mail, help: 'Up to 10 addresses, separated by commas.' },
};

function describe(channel: Channel) {
  if (channel.type === 'email') return channel.config.emails?.join(', ') ?? '';
  try {
    return new URL(channel.config.url ?? '').host;
  } catch {
    return channel.config.url ?? '';
  }
}

function ChannelDialog({
  open,
  onOpenChange,
  channel,
  teamId,
  emailConfigured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel?: Channel;
  teamId: string | null;
  emailConfigured: boolean;
}) {
  const save = useSaveChannel(teamId);
  const [type, setType] = useState<ChannelType>(channel?.type ?? 'slack');
  const meta = CHANNEL_META[type];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();

    const config =
      type === 'email'
        ? {
            emails: value('emails')
              .split(/[,\s]+/)
              .filter(Boolean),
          }
        : {
            url: value('url'),
            ...(type === 'webhook' && value('secret') && { secret: value('secret') }),
          };

    try {
      await save.mutateAsync({ id: channel?.id, name: value('name'), type, config });
      toast.success(channel ? 'Channel saved' : 'Channel added');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the channel.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{channel ? 'Edit channel' : 'Add channel'}</DialogTitle>
            <DialogDescription>Where alerts are delivered.</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel>Type</FieldLabel>
              <Select value={type} onValueChange={value => setType(value as ChannelType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(Object.keys(CHANNEL_META) as ChannelType[]).map(key => (
                      <SelectItem
                        key={key}
                        value={key}
                        disabled={key === 'email' && !emailConfigured}
                      >
                        {CHANNEL_META[key].label}
                        {key === 'email' && !emailConfigured && ' (set up SMTP first)'}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="channel-name">Name</FieldLabel>
              <Input
                id="channel-name"
                name="name"
                required
                maxLength={100}
                defaultValue={channel?.name}
                placeholder={type === 'email' ? 'Support team' : '#alerts'}
              />
            </Field>
            {type === 'email' ? (
              <Field>
                <FieldLabel htmlFor="channel-emails">Email addresses</FieldLabel>
                <Input
                  id="channel-emails"
                  name="emails"
                  required
                  defaultValue={channel?.config.emails?.join(', ')}
                  placeholder="you@example.com, support@example.com"
                />
                <FieldDescription>{meta.help}</FieldDescription>
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="channel-url">Webhook URL</FieldLabel>
                <Input
                  id="channel-url"
                  name="url"
                  type="url"
                  required
                  defaultValue={channel?.type === type ? channel.config.url : undefined}
                  placeholder={meta.placeholder}
                />
                <FieldDescription>{meta.help}</FieldDescription>
              </Field>
            )}
            {type === 'webhook' && (
              <Field>
                <FieldLabel htmlFor="channel-secret">Signing secret</FieldLabel>
                <Input
                  id="channel-secret"
                  name="secret"
                  type="password"
                  autoComplete="off"
                  maxLength={200}
                  placeholder={
                    channel?.config.hasSecret ? 'Leave blank to keep the current one' : 'Optional'
                  }
                />
                <FieldDescription>
                  Signs each body: <code>X-Ghostwire-Signature: sha256=&lt;HMAC&gt;</code>.
                </FieldDescription>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner data-icon="inline-start" />}
              {channel ? 'Save' : 'Add channel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ChannelRow({ channel, canManage }: { channel: Channel; canManage: boolean }) {
  const test = useTestChannel();
  const remove = useDeleteChannel();
  const [editing, setEditing] = useState(false);
  const meta = CHANNEL_META[channel.type];
  const Icon = meta.icon;

  async function handleTest() {
    const result = await test.mutateAsync(channel.id).catch(e => ({ ok: false, error: String(e) }));
    if (result.ok) toast.success(`Test sent to ${channel.name}`);
    else toast.error(`${channel.name}: ${result.error}`);
  }

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
          <Icon />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{channel.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {meta.label} · {describe(channel)}
          </span>
        </div>
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-1">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={test.isPending}>
            {test.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            Test
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit channel"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Delete channel">
                <Trash2 />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {channel.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Alerts that use it stop being delivered there.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() =>
                    remove.mutateAsync(channel.id).then(() => toast.success('Channel deleted'))
                  }
                >
                  Delete channel
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
      {editing && (
        <ChannelDialog
          open={editing}
          onOpenChange={setEditing}
          channel={channel}
          teamId={channel.teamId}
          emailConfigured
        />
      )}
    </li>
  );
}

function ChannelList({
  title,
  description,
  teamId,
  canManage,
}: {
  title: string;
  description: string;
  teamId: string | null;
  canManage: boolean;
}) {
  const { data, isPending } = useChannels(teamId);
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
        {canManage && (
          <CardAction>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus data-icon="inline-start" />
              Add channel
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : !data?.data.length ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Bell />
              </EmptyMedia>
              <EmptyTitle>No channels yet</EmptyTitle>
              <EmptyDescription>Add Slack, Discord, a webhook or email.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y">
            {data.data.map(channel => (
              <ChannelRow key={channel.id} channel={channel} canManage={canManage} />
            ))}
          </ul>
        )}
      </CardContent>
      {adding && (
        <ChannelDialog
          open={adding}
          onOpenChange={setAdding}
          teamId={teamId}
          emailConfigured={!!data?.emailConfigured}
        />
      )}
    </Card>
  );
}

export function NotificationsSettings() {
  const { team, teamId } = useActiveTeam();
  const { data } = useChannels(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Where alerts are sent. Choose which alerts go where in each website's settings."
      />
      {data && !data.emailConfigured && (
        <Alert>
          <Mail />
          <AlertDescription>
            Email alerts need SMTP on the server: set SMTP_URL and SMTP_FROM.
          </AlertDescription>
        </Alert>
      )}
      <ChannelList
        title="Your channels"
        description="Only you can use these, on any website you manage."
        teamId={null}
        canManage
      />
      {team && teamId && (
        <ChannelList
          title={`${team.name} channels`}
          description="Shared with the team, for the team's websites. Managers can change them."
          teamId={teamId}
          canManage
        />
      )}
    </div>
  );
}
