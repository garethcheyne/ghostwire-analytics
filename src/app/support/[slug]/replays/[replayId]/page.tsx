import { SupportReplay } from '@/components/support/support-view';

export default async function SupportReplayPage({
  params,
}: PageProps<'/support/[slug]/replays/[replayId]'>) {
  const { slug, replayId } = await params;

  return <SupportReplay slug={slug} replayId={replayId} />;
}
