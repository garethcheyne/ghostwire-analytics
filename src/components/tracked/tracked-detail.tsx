'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { WebsiteOverview } from '@/components/analytics/website-overview';
import { CopyButton } from '@/components/copy-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { WebsiteProvider } from '@/components/websites/website-context';
import { api } from '@/lib/api-client';
import { KIND, type TrackedEntity, type TrackedKind, useTrackedUrl } from './tracked-entities';

function HowToUse({ kind, entity }: { kind: TrackedKind; entity: TrackedEntity }) {
  const url = useTrackedUrl(kind, entity.slug);
  const embed = `<img src="${url}" alt="" width="1" height="1" style="display:none" />`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{kind === 'links' ? 'Short link' : 'Embed'}</CardTitle>
        <CardDescription>
          {kind === 'links'
            ? `Share this instead of the destination; every click is counted, then redirected to ${entity.url}.`
            : 'Add this image to an email or page. Each time it loads, a view is counted.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {kind === 'links' ? (
          <InputGroup className="max-w-xl">
            <InputGroupInput value={url} readOnly className="font-mono text-xs" />
            <InputGroupAddon align="inline-end">
              <CopyButton value={url} label="Copy link" />
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <InputGroup>
            <InputGroupTextarea value={embed} readOnly rows={2} className="font-mono text-xs" />
            <InputGroupAddon align="block-end" className="justify-end">
              <CopyButton value={embed} label="Copy embed code" />
            </InputGroupAddon>
          </InputGroup>
        )}
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
