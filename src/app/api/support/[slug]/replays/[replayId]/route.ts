import { restoreReplayEventFragments } from '@/lib/replay';
import { mergeReplayEvents } from '@/lib/replay-chunks';
import { json, notFound } from '@/lib/response';
import { getActiveSupportLink } from '@/lib/support-links';
import { getReplayChunks } from '@/queries/sql';
import { getWebsiteUser } from '@/queries/sql/users/getWebsiteUser';

/** Public: one of the user's replays, only when the support link includes replays. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string; replayId: string }> },
) {
  const { slug, replayId } = await params;
  const link = await getActiveSupportLink(slug);
  if (!link?.includeReplays) return notFound();

  // Only replays of this user's own visits.
  const user = await getWebsiteUser(link.websiteId, link.distinctId);
  if (!user?.replays.some(replay => replay.id === replayId)) return notFound();

  const chunks = await getReplayChunks(link.websiteId, replayId, {});
  const events = restoreReplayEventFragments(mergeReplayEvents(chunks, {}));

  return json({ events, startedAt: chunks[0]?.startedAt ?? null });
}
