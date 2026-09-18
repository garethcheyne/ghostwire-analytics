'use client';
import { format } from 'date-fns';
import { ArrowLeft, Bookmark, BookmarkCheck, Eye, Zap } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { formatMetricLabel } from '@/components/analytics/metric-labels';
import { DeviceIcon } from '@/components/analytics/sessions-view';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useSession, useSessionActivity } from '@/hooks/queries/analytics';
import { useReplay, useReplaySaved, useSetReplaySaved } from '@/hooks/queries/replays';
import { formatShortTime } from '@/lib/format';
import { ReplayPlayer } from './replay-player';

const SEEK_LEAD_MS = 3000;

function formatOffset(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function SaveReplayButton({ replayId }: { replayId: string }) {
  const website = useCurrentWebsite();
  const { data } = useReplaySaved(website.id, replayId);
  const setSaved = useSetReplaySaved(website.id, replayId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  if (!website.canUpdate) return null;

  if (data?.isSaved) {
    return (
      <Button
        variant="secondary"
        disabled={setSaved.isPending}
        onClick={() =>
          setSaved.mutate(
            { isSaved: false },
            { onSuccess: () => toast.success('Removed from saved replays') },
          )
        }
      >
        <BookmarkCheck data-icon="inline-start" />
        Saved
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Bookmark data-icon="inline-start" />
          Save
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <form
          className="flex flex-col gap-3"
          onSubmit={event => {
            event.preventDefault();
            setSaved.mutate(
              { isSaved: true, name: name.trim() },
              {
                onSuccess: () => {
                  toast.success('Replay saved');
                  setOpen(false);
                },
                onError: error => toast.error(error.message),
              },
            );
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="replay-name">Name</FieldLabel>
              <Input
                id="replay-name"
                autoFocus
                maxLength={100}
                placeholder="Checkout confusion"
                value={name}
                onChange={event => setName(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <Button type="submit" size="sm" disabled={setSaved.isPending}>
            Save replay
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value || '–'}</dd>
    </div>
  );
}

export function ReplayDetail({ replayId }: { replayId: string }) {
  const website = useCurrentWebsite();
  const { data: replay, isPending, error } = useReplay(website.id, replayId);
  const sessionId = replay?.sessionId ?? '';
  const { data: session } = useSession(website.id, sessionId);
  const { data: activity } = useSessionActivity(
    website.id,
    sessionId,
    replay?.startedAt ?? undefined,
    replay?.endedAt ?? undefined,
  );
  const playerRef = useRef<{ goto?: (ms: number, play?: boolean) => void } | null>(null);
  // ?at=<epoch ms> (e.g. from an error): start playback a few seconds before that moment.
  const at = Number(useSearchParams().get('at')) || null;

  if (isPending) {
    return <Skeleton className="h-[32rem] w-full" />;
  }

  if (error || !replay?.sessionId) {
    return <p className="text-sm text-muted-foreground">This replay could not be found.</p>;
  }

  // Offsets are measured from the first recorded rrweb event, which is where the player starts.
  const firstTimestamp = Number(replay.events.find(event => event?.timestamp)?.timestamp) || 0;
  const lastTimestamp = Number(replay.events.findLast(event => event?.timestamp)?.timestamp) || 0;
  const duration = lastTimestamp - firstTimestamp;
  const visitActivity = (activity ?? [])
    .filter(item => item.visitId === replayId)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const location = [
    session?.city,
    session?.country && formatMetricLabel('country', session.country),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href={`/websites/${website.id}/replays`}
            className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Replays
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <DeviceIcon device={session?.device ?? null} />
            Replay
            {replay.startedAt && (
              <span className="text-base font-normal text-muted-foreground">
                {format(new Date(replay.startedAt), 'd MMM yyyy, h:mm a')}
              </span>
            )}
          </h1>
        </div>
        <SaveReplayButton replayId={replayId} />
      </div>

      {at && (
        <p className="text-sm text-muted-foreground">
          Starting {SEEK_LEAD_MS / 1000} seconds before {format(new Date(at), 'h:mm:ss a')}.
        </p>
      )}
      <ReplayPlayer
        events={replay.events}
        onReady={player => {
          playerRef.current = player;
          if (at) player.goto?.(Math.max(0, at - firstTimestamp - SEEK_LEAD_MS), true);
        }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Visitor</CardTitle>
            <CardDescription>
              <Link
                href={`/websites/${website.id}/sessions/${replay.sessionId}`}
                className="font-mono text-primary hover:underline"
              >
                Session {replay.sessionId.slice(0, 8)}
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Detail
                label="Length"
                value={formatShortTime(Math.round(duration / 1000), ['m', 's'], ' ') || '0s'}
              />
              <Detail label="Recorded actions" value={replay.eventCount.toLocaleString()} />
              <Detail label="Location" value={location} />
              <Detail
                label="Device"
                value={session && formatMetricLabel('device', session.device)}
              />
              <Detail
                label="Browser"
                value={session && formatMetricLabel('browser', session.browser)}
              />
              <Detail label="OS" value={session && formatMetricLabel('os', session.os)} />
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <CardDescription>
              Page views and events in this visit. Click one to jump to it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!activity ? (
              <Skeleton className="h-32 w-full" />
            ) : visitActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No page views or events in this visit.
              </p>
            ) : (
              <ol className="flex flex-col">
                {visitActivity.map(item => {
                  const offset = +new Date(item.createdAt) - firstTimestamp;

                  return (
                    <li key={item.eventId}>
                      <button
                        type="button"
                        onClick={() => playerRef.current?.goto?.(Math.max(0, offset), true)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">
                          {formatOffset(offset)}
                        </span>
                        {item.eventName ? (
                          <Zap className="size-4 shrink-0 text-chart-4" aria-label="Event" />
                        ) : (
                          <Eye
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-label="Page view"
                          />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {item.eventName ? (
                            <>
                              <span className="font-medium">{item.eventName}</span>
                              <span className="text-muted-foreground"> on {item.urlPath}</span>
                            </>
                          ) : (
                            item.urlPath
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
