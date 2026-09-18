'use client';
import { endOfDay, format, formatDistanceToNowStrict, startOfDay } from 'date-fns';
import { FileCode, Rocket, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { CopyButton } from '@/components/copy-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrentWebsite } from '@/components/websites/website-context';
import {
  type ReleaseSummary,
  useDeleteSourceMaps,
  useReleases,
  useSourceMaps,
} from '@/hooks/queries/releases';
import { getDateRangeValue } from '@/lib/date';
import { formatLongNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Share of sessions without an error, or null with no sessions to judge by. */
export function crashFreeRate(release: Pick<ReleaseSummary, 'sessions' | 'errorSessions'>) {
  if (!release.sessions) return null;
  return Math.max(0, 1 - release.errorSessions / release.sessions);
}

function CrashFree({ release }: { release: ReleaseSummary }) {
  const rate = crashFreeRate(release);
  if (rate === null) return <span className="text-muted-foreground">–</span>;

  const percent = rate * 100;
  return (
    <span
      className={cn(
        'tabular-nums',
        percent >= 99.5
          ? 'text-status-online'
          : percent >= 98
            ? 'text-status-pending'
            : 'text-destructive',
      )}
    >
      {percent >= 99.95 ? '100' : percent.toFixed(1)}%
    </span>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function SourceMaps() {
  const { id: websiteId, canUpdate } = useCurrentWebsite();
  const { data } = useSourceMaps(websiteId);
  const remove = useDeleteSourceMaps(websiteId);

  if (!data?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Source maps</CardTitle>
        <CardDescription>
          Errors from these releases show your original files and code.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {data.map(item => (
            <li key={item.release} className="flex items-center gap-3 py-2 text-sm">
              <FileCode className="text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono">{item.release}</span>
              <span className="text-muted-foreground">
                {item.files} {item.files === 1 ? 'file' : 'files'} · {formatBytes(item.size)} ·{' '}
                {formatDistanceToNowStrict(new Date(item.uploadedAt), { addSuffix: true })}
              </span>
              {canUpdate && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete source maps for ${item.release}`}
                  disabled={remove.isPending}
                  onClick={() =>
                    remove
                      .mutateAsync(item.release)
                      .then(() => toast.success(`Source maps for ${item.release} deleted`))
                  }
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function SetupHelp({ websiteId }: { websiteId: string }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const curl = `curl -X POST ${origin}/api/websites/${websiteId}/releases \\
  -H "Authorization: Bearer $GHOSTWIRE_ERROR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"version":"'$VERSION'","environment":"production","commit":"'$GIT_SHA'"}'`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send the version you deployed</CardTitle>
        <CardDescription>
          Page views and errors then carry it, so you can see what each release changed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <span className="font-medium">Tracker script</span>
          <code className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
            {`<script defer src="…/script.js" data-website-id="${websiteId}" data-release="2.4.1"></script>`}
          </code>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-medium">React / Next.js</span>
          <code className="rounded-md bg-muted px-3 py-2 font-mono text-xs break-all">
            {'<GhostwireProvider release={process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA} … />'}
          </code>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center justify-between font-medium">
            Mark deploys from CI (optional)
            <CopyButton value={curl} label="Copy command" />
          </span>
          <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
            {curl}
          </pre>
          <span className="text-muted-foreground">
            Uses the server key from Settings → Errors. Deploys show as markers on the traffic
            chart.
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-medium">Upload source maps after each build</span>
          <pre className="overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs">
            {`npx ghostwire sourcemaps upload --dir .next/static --url-prefix /_next/static --delete`}
          </pre>
          <span className="text-muted-foreground">
            From <code>@ghostwire/node</code>, with GHOSTWIRE_HOST, GHOSTWIRE_WEBSITE_ID,
            GHOSTWIRE_ERROR_KEY and GHOSTWIRE_RELEASE set. For Next.js, turn on browser source maps
            with <code>withGhostwire(config, {'{ sourceMaps: true }'})</code>; --delete keeps them
            off your public site.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReleasesView() {
  const website = useCurrentWebsite();
  const { data, isPending } = useReleases(website.id);
  // From the day the release appeared until now, so every error in it is counted.
  const errorsHref = (release: ReleaseSummary, onlyNew = false) => {
    const params = new URLSearchParams({
      release: release.version,
      date: getDateRangeValue(startOfDay(new Date(release.firstSeen)), endOfDay(new Date())),
    });
    if (onlyNew) params.set('new', '1');
    return `/websites/${website.id}/errors?${params.toString()}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Releases" />
      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : !data?.length ? (
        <>
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Rocket />
              </EmptyMedia>
              <EmptyTitle>No releases yet</EmptyTitle>
              <EmptyDescription>
                Tell Ghostwire which version is live to see crash-free sessions and new errors per
                release.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent />
          </Empty>
          <SetupHelp websiteId={website.id} />
        </>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Releases</CardTitle>
              <CardDescription>
                The latest 50, newest first. Crash-free: sessions on the release without an error.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead className="hidden md:table-cell">Deployed</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Crash-free</TableHead>
                    <TableHead className="text-right">Errors</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Regressed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map(release => {
                    const when = release.deployedAt ?? release.firstSeen;
                    return (
                      <TableRow key={release.version}>
                        <TableCell className="max-w-0 w-full">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="truncate font-mono font-medium">
                              {release.version}
                            </span>
                            {release.environment && (
                              <Badge variant="secondary">{release.environment}</Badge>
                            )}
                            {release.commit &&
                              (release.url ? (
                                <a
                                  href={release.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono text-xs text-muted-foreground hover:underline"
                                >
                                  {release.commit.slice(0, 7)}
                                </a>
                              ) : (
                                <span className="font-mono text-xs text-muted-foreground">
                                  {release.commit.slice(0, 7)}
                                </span>
                              ))}
                          </div>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                          <Tooltip>
                            <TooltipTrigger>
                              {formatDistanceToNowStrict(new Date(when), { addSuffix: true })}
                            </TooltipTrigger>
                            <TooltipContent>
                              {release.deployedAt ? 'Deployed' : 'First seen'}{' '}
                              {format(new Date(when), 'PPp')}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatLongNumber(release.sessions)}
                        </TableCell>
                        <TableCell className="text-right">
                          <CrashFree release={release} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Link href={errorsHref(release)} className="hover:underline">
                            {formatLongNumber(release.errors)}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {release.newErrors ? (
                            <Link
                              href={errorsHref(release, true)}
                              className="text-destructive hover:underline"
                            >
                              {release.newErrors}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden text-right tabular-nums sm:table-cell">
                          {release.regressions || <span className="text-muted-foreground">0</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <SourceMaps />
          <SetupHelp websiteId={website.id} />
        </>
      )}
    </div>
  );
}
