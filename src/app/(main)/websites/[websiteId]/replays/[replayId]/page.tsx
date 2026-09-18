import type { Metadata } from 'next';
import { ReplayDetail } from '@/components/replays/replay-detail';

export const metadata: Metadata = { title: 'Replay' };

export default async function ReplayPage({
  params,
}: PageProps<'/websites/[websiteId]/replays/[replayId]'>) {
  const { replayId } = await params;

  return <ReplayDetail replayId={replayId} />;
}
