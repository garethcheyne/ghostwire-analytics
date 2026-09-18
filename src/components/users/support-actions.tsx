'use client';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { ClipboardCopy, LifeBuoy, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatMetricLabel } from '@/components/analytics/metric-labels';
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
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { useCurrentWebsite } from '@/components/websites/website-context';
import {
  type WebsiteUserDetail,
  useCreateSupportLink,
  useRevokeSupportLink,
  useSupportLinks,
} from '@/hooks/queries/users';

const RECENT_ACTIONS = 15;
const RECENT_ERRORS = 5;

/** A Markdown summary of what the user did recently, for pasting into a ticket. */
export function ticketSummary(user: WebsiteUserDetail, websiteId: string, origin: string) {
  const field = (key: string) => user.properties.find(p => p.dataKey === key)?.stringValue;
  const when = (date: string) => format(new Date(date), 'd MMM yyyy, HH:mm');
  const app = (path: string) => `${origin}/websites/${websiteId}${path}`;
  const latest = user.sessions[0];
  const device = latest
    ? [
        formatMetricLabel('browser', latest.browser),
        formatMetricLabel('os', latest.os),
        latest.country && formatMetricLabel('country', latest.country),
      ]
        .filter(Boolean)
        .join(', ')
    : null;

  const lastVisit = user.activity[0]?.visitId;
  const actions = user.activity
    .filter(item => item.visitId === lastVisit)
    .slice(0, RECENT_ACTIONS)
    .reverse();
  const replay = user.replays.find(item => item.id === lastVisit);

  const lines = [
    `**User:** ${field('name') ? `${field('name')} (${user.id})` : user.id}`,
    ...(field('email') ? [`**Email:** ${field('email')}`] : []),
    ...(latest ? [`**Last seen:** ${when(latest.lastAt)}${device ? ` · ${device}` : ''}`] : []),
    `**Errors:** ${user.errors.length}`,
  ];

  if (user.errors.length) {
    lines.push('', '**Recent errors**');
    user.errors.slice(0, RECENT_ERRORS).forEach(error => {
      lines.push(
        `- ${when(error.createdAt)} ${error.type}: ${error.message}${error.urlPath ? ` (${error.urlPath})` : ''} ${app(`/errors/${error.groupId}`)}`,
      );
    });
  }

  if (actions.length) {
    lines.push('', `**Last visit** (${when(actions[0].createdAt)})`);
    actions.forEach(item => {
      const time = format(new Date(item.createdAt), 'HH:mm:ss');
      lines.push(
        `- ${time} ${item.eventName ? `${item.eventName} on ${item.urlPath}` : item.urlPath}`,
      );
    });
    if (replay) lines.push(`- Replay: ${app(`/replays/${replay.id}`)}`);
  }

  lines.push('', `Full timeline: ${app(`/users/${encodeURIComponent(user.id)}`)}`);

  return lines.join('\n');
}

function supportUrl(slug: string) {
  return `${window.location.origin}${process.env.basePath ?? ''}/support/${slug}`;
}

function SupportLinkDialog({ user }: { user: WebsiteUserDetail }) {
  const website = useCurrentWebsite();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState('7');
  const [includeReplays, setIncludeReplays] = useState(false);
  const [note, setNote] = useState('');
  const { data: links } = useSupportLinks(website.id, user.id, open);
  const create = useCreateSupportLink(website.id, user.id);
  const revoke = useRevokeSupportLink(website.id, user.id);

  async function handleCreate() {
    try {
      await create.mutateAsync({
        days: Number(days),
        includeReplays,
        note: note.trim() || undefined,
      });
      setNote('');
      toast.success('Support link created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the link.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <LifeBuoy data-icon="inline-start" />
          Support link
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Support link</DialogTitle>
          <DialogDescription>
            A read-only page with this user&apos;s timeline and errors for a ticket. Anyone with the
            link can open it until it expires.
          </DialogDescription>
        </DialogHeader>

        {!!links?.length && (
          <div className="flex flex-col gap-2">
            {links.map(link => (
              <div key={link.id} className="flex flex-col gap-1">
                <InputGroup>
                  <InputGroupInput
                    readOnly
                    value={supportUrl(link.slug)}
                    aria-label="Support link"
                    className="font-mono text-xs"
                  />
                  <InputGroupAddon align="inline-end">
                    <CopyButton value={supportUrl(link.slug)} label="Copy link" />
                  </InputGroupAddon>
                </InputGroup>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    {link.note ? `${link.note} · ` : ''}
                    {link.includeReplays ? 'With replays · ' : ''}
                    expires{' '}
                    {formatDistanceToNowStrict(new Date(link.expiresAt), { addSuffix: true })}
                  </span>
                  {website.canUpdate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() =>
                        revoke.mutateAsync(link.id).then(() => toast.success('Link revoked'))
                      }
                    >
                      <Trash2 data-icon="inline-start" />
                      Revoke
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Separator className="my-2" />
          </div>
        )}

        {website.canUpdate ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="support-note">Ticket (optional)</FieldLabel>
              <Input
                id="support-note"
                placeholder="#4821 checkout fails"
                maxLength={200}
                value={note}
                onChange={event => setNote(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel>Expires after</FieldLabel>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="1">1 day</SelectItem>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Include replays</FieldTitle>
                <FieldDescription>
                  Let the link open this user&apos;s session replays.
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={includeReplays}
                onCheckedChange={setIncludeReplays}
                aria-label="Include replays"
              />
            </Field>
          </FieldGroup>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only people who can edit this website can create links.
          </p>
        )}

        {website.canUpdate && (
          <DialogFooter>
            <Button onClick={handleCreate} disabled={create.isPending}>
              {create.isPending && <Spinner data-icon="inline-start" />}
              Create link
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function SupportActions({
  websiteId,
  user,
}: {
  websiteId: string;
  user: WebsiteUserDetail;
}) {
  async function copySummary() {
    try {
      await navigator.clipboard.writeText(ticketSummary(user, websiteId, window.location.origin));
      toast.success('Summary copied: paste it into the ticket');
    } catch {
      toast.error('Could not copy to the clipboard.');
    }
  }

  return (
    <>
      <Button variant="outline" onClick={copySummary}>
        <ClipboardCopy data-icon="inline-start" />
        Copy for ticket
      </Button>
      <SupportLinkDialog user={user} />
    </>
  );
}
