'use client';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowLeft, LifeBuoy, LinkIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { ReplayPlayer } from '@/components/replays/replay-player';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { type UserLinks, UserDetailView } from '@/components/users/user-detail';
import type { WebsiteUserDetail } from '@/hooks/queries/users';
import { api } from '@/lib/api-client';

interface SupportData {
  website: { name: string; domain: string | null };
  link: { expiresAt: string; includeReplays: boolean; note: string | null };
  user: WebsiteUserDetail;
}

function useSupport(slug: string) {
  return useQuery({
    queryKey: ['support', slug],
    queryFn: () => api.get<SupportData>(`/support/${encodeURIComponent(slug)}`),
    retry: false,
  });
}

function Unavailable() {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LinkIcon />
        </EmptyMedia>
        <EmptyTitle>This link doesn&apos;t work</EmptyTitle>
        <EmptyDescription>It may have expired or been revoked.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** A support link: one user's timeline, read-only, until the link expires. */
export function SupportView({ slug }: { slug: string }) {
  const { data, isPending, error } = useSupport(slug);
  const includeReplays = !!data?.link.includeReplays;
  const links = useMemo<UserLinks>(
    () => ({
      error: () => null,
      session: () => null,
      replay: replayId => (includeReplays ? `/support/${slug}/replays/${replayId}` : null),
    }),
    [slug, includeReplays],
  );

  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (error || !data) return <Unavailable />;

  return (
    <div className="flex flex-col gap-6">
      <Alert>
        <LifeBuoy />
        <AlertDescription>
          <span>
            Shared for support from <strong>{data.website.name}</strong>
            {data.link.note && <> · {data.link.note}</>}. Read-only; the link expires{' '}
            {formatDistanceToNowStrict(new Date(data.link.expiresAt), { addSuffix: true })}.
          </span>
        </AlertDescription>
      </Alert>
      <UserDetailView user={data.user} links={links} />
    </div>
  );
}

export function SupportReplay({ slug, replayId }: { slug: string; replayId: string }) {
  const { data, isPending, error } = useQuery({
    queryKey: ['support', slug, 'replay', replayId],
    queryFn: () =>
      api.get<{ events: any[] }>(
        `/support/${encodeURIComponent(slug)}/replays/${encodeURIComponent(replayId)}`,
      ),
    retry: false,
    staleTime: Infinity,
  });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/support/${slug}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Timeline
      </Link>
      {isPending ? (
        <Skeleton className="aspect-video w-full" />
      ) : error || !data?.events.length ? (
        <Unavailable />
      ) : (
        <ReplayPlayer events={data.events} />
      )}
    </div>
  );
}
