import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReplayDetail } from '@/components/replays/replay-detail';

export const metadata: Metadata = { title: 'Replay' };

export default async function ReplayPage({
  params,
}: PageProps<'/websites/[websiteId]/replays/[replayId]'>) {
  const { replayId } = await params;

  return (
    <Suspense>
      <ReplayDetail replayId={replayId} />
    </Suspense>
  );
}
