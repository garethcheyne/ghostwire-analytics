'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { WebsiteOverview } from '@/components/analytics/website-overview';
import { CopyButton } from '@/components/copy-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { WebsiteProvider } from '@/components/websites/website-context';
import { api } from '@/lib/api-client';
import { PixelEmbed } from './pixel-embed';
import { KIND, type TrackedEntity, type TrackedKind, useTrackedUrl } from './tracked-entities';

function HowToUse({ kind, entity }: { kind: TrackedKind; entity: TrackedEntity }) {
  const url = useTrackedUrl(kind, entity.slug);

  // Pixels get their own panel: pasting one into a signature needs real
  // instructions, and the limits of what it measures need stating outright.
  if (kind === 'pixels') {
    return <PixelEmbed url={url} name={entity.name} />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Short link</CardTitle>
        <CardDescription>
          {`Share this instead of the destination; every click is counted, then redirected to ${entity.url}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InputGroup className="max-w-xl">
          <InputGroupInput value={url} readOnly className="font-mono text-xs" />
          <InputGroupAddon align="inline-end">
            <CopyButton value={url} label="Copy link" />
          </InputGroupAddon>
        </InputGroup>
      </CardContent>
    </Card>
  );
}

/** Stats for one link or pixel: the website overview report, run against it. */
export function TrackedDetail({ kind, id }: { kind: TrackedKind; id: string }) {
  const {
    data: entity,
    isPending,
    error,
  } = useQuery({
    queryKey: [kind, 'detail', id],
    queryFn: () => api.get<TrackedEntity>(`/${kind}/${id}`),
  });

  if (isPending) return <Skeleton className="h-96 w-full" />;

  if (error || !entity) {
    return <p className="text-sm text-muted-foreground">Not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/${kind}`}
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {KIND[kind].title}
      </Link>
      <WebsiteProvider
        website={{
          id: entity.id,
          name: entity.name,
          domain: null,
          teamId: entity.teamId,
          userId: entity.userId,
          canUpdate: false,
          canDelete: false,
          kind: kind === 'links' ? 'link' : 'pixel',
        }}
      >
        <Suspense>
          <WebsiteOverview />
        </Suspense>
      </WebsiteProvider>
      <HowToUse kind={kind} entity={entity} />
    </div>
  );
}
