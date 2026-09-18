'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { CHANNEL_META } from '@/components/settings/notifications-settings';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
  type AlertRule,
  type AlertType,
  type Channel,
  useSaveAlertRule,
  useWebsiteAlerts,
} from '@/hooks/queries/alerts';
import { useCurrentWebsite } from '../website-context';

const RULES: Record<
  AlertType,
  {
    title: string;
    description: string;
    params?: { key: string; label: string; suffix: string; max?: number }[];
  }
> = {
  'error.new': {
    title: 'New errors',
    description: 'An error that has never happened before on this site.',
  },
  'error.regression': {
    title: 'Regressions',
    description: 'An error you marked as resolved happens again.',
  },
  'error.spike': {
    title: 'Error spike',
    description: 'Lots of errors in a short time, e.g. after a bad deploy.',
    params: [
      { key: 'count', label: 'At least', suffix: 'errors' },
      { key: 'minutes', label: 'Within', suffix: 'minutes', max: 1440 },
    ],
  },
  'traffic.drop': {
    title: 'Traffic drop',
    description:
      'Page views in the last hour well below the same hour in previous weeks (or none at all, e.g. tracking removed).',
    params: [
      { key: 'percent', label: 'Drop of', suffix: '% or more', max: 99 },
      { key: 'minimum', label: 'When usually at least', suffix: 'views an hour' },
    ],
  },
};

function RuleCard({ rule, channels }: { rule: AlertRule; channels: Channel[] }) {
  const { id: websiteId, canUpdate } = useCurrentWebsite();
  const save = useSaveAlertRule(websiteId);
  const [draft, setDraft] = useState(rule);
  const meta = RULES[rule.type];
  const dirty = JSON.stringify(draft) !== JSON.stringify(rule);

  async function persist(next: AlertRule) {
    try {
      await save.mutateAsync({
        type: next.type,
        enabled: next.enabled,
        channelIds: next.channelIds,
        parameters: next.parameters,
      });
      toast.success(`${meta.title} alerts saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the alert.');
    }
  }

  const toggleChannel = (id: string, on: boolean) =>
    setDraft(current => ({
      ...current,
      channelIds: on
        ? [...current.channelIds, id]
        : current.channelIds.filter(channelId => channelId !== id),
    }));

  return (
    <Card>
      <CardHeader>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>{meta.title}</FieldTitle>
            <FieldDescription>{meta.description}</FieldDescription>
          </FieldContent>
          <Switch
            checked={draft.enabled}
            disabled={!canUpdate}
            aria-label={`${meta.title} alerts`}
            onCheckedChange={enabled => setDraft(current => ({ ...current, enabled }))}
          />
        </Field>
      </CardHeader>
      {draft.enabled && (
        <CardContent>
          <FieldGroup>
            {meta.params && (
              <div className="grid gap-4 sm:grid-cols-2">
                {meta.params.map(param => (
                  <Field key={param.key}>
                    <FieldLabel htmlFor={`${rule.type}-${param.key}`}>{param.label}</FieldLabel>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`${rule.type}-${param.key}`}
                        type="number"
                        min={1}
                        max={param.max}
                        className="w-28"
                        disabled={!canUpdate}
                        value={draft.parameters[param.key] ?? ''}
                        onChange={event =>
                          setDraft(current => ({
                            ...current,
                            parameters: {
                              ...current.parameters,
                              [param.key]: Number(event.target.value),
                            },
                          }))
                        }
                      />
                      <span className="text-sm text-muted-foreground">{param.suffix}</span>
                    </div>
                  </Field>
                ))}
              </div>
            )}
            <FieldSet>
              <FieldLegend variant="label">Send to</FieldLegend>
              {channels.length ? (
                <div className="flex flex-col gap-2">
                  {channels.map(channel => {
                    const Icon = CHANNEL_META[channel.type].icon;
                    return (
                      <Field key={channel.id} orientation="horizontal">
                        <Checkbox
                          id={`${rule.type}-${channel.id}`}
                          disabled={!canUpdate}
                          checked={draft.channelIds.includes(channel.id)}
                          onCheckedChange={checked => toggleChannel(channel.id, checked === true)}
                        />
                        <FieldLabel htmlFor={`${rule.type}-${channel.id}`} className="font-normal">
                          <Icon className="text-muted-foreground" />
                          {channel.name}
                          {channel.teamId && (
                            <Badge variant="secondary" className="ml-1">
                              Team
                            </Badge>
                          )}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </div>
              ) : (
                <FieldDescription>
                  No channels yet.{' '}
                  <Link href="/settings/notifications" className="underline underline-offset-4">
                    Add one in Notifications
                  </Link>
                  .
                </FieldDescription>
              )}
            </FieldSet>
          </FieldGroup>
        </CardContent>
      )}
      {canUpdate && dirty && (
        <CardContent className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDraft(rule)}>
            Cancel
          </Button>
          <Button
            onClick={() => persist(draft)}
            disabled={save.isPending || (draft.enabled && !draft.channelIds.length)}
          >
            {save.isPending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
        </CardContent>
      )}
    </Card>
  );
}

export function AlertSettings() {
  const { id: websiteId } = useCurrentWebsite();
  const { data, isPending } = useWebsiteAlerts(websiteId);

  if (isPending || !data) return <Skeleton className="h-96 w-full" />;

  const channelName = (id: string | null) => data.channels.find(c => c.id === id)?.name ?? '';

  return (
    <div className="flex flex-col gap-4">
      {!data.channels.length && (
        <Alert>
          <Bell />
          <AlertDescription>
            <span>
              Alerts go to Slack, Discord, a webhook or email.{' '}
              <Link href="/settings/notifications" className="underline underline-offset-4">
                Add a channel
              </Link>{' '}
              first.
            </span>
          </AlertDescription>
        </Alert>
      )}
      {data.rules.map(rule => (
        <RuleCard
          // Remount when the saved rule changes so the draft starts from it.
          key={`${rule.type}:${JSON.stringify(rule)}`}
          rule={rule}
          channels={data.channels}
        />
      ))}
      <Card>
        <CardHeader>
          <CardTitle>Recent alerts</CardTitle>
          <CardDescription>The last 20 alerts sent for this website.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.log.length ? (
            <ul className="flex flex-col divide-y">
              {data.log.map(entry => (
                <li key={entry.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 truncate text-sm">{entry.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {channelName(entry.channelId)}
                    <Badge variant={entry.status === 'sent' ? 'secondary' : 'destructive'}>
                      {entry.status === 'sent' ? 'Sent' : 'Failed'}
                    </Badge>
                    <span title={entry.error ?? undefined}>
                      {formatDistanceToNowStrict(new Date(entry.createdAt), { addSuffix: true })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No alerts yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
