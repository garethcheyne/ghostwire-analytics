import { restoreReplayEventFragments } from '@/lib/replay';
import { mergeReplayEvents, parseOptionalInteger } from '@/lib/replay-chunks';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getReplayChunks } from '@/queries/sql';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string; replayId: string }> },
) {
  const { auth, error } = await parseRequest(request);

  if (error) {
    return error();
  }

  const { websiteId, replayId } = await params;
  const searchParams = new URL(request.url).searchParams;
  const until = parseOptionalInteger(searchParams.get('until'));
  const endChunkIndex = parseOptionalInteger(searchParams.get('chunkIndex'));
  const endEventIndex = parseOptionalInteger(searchParams.get('eventIndex'));
  const endAt = until !== undefined ? new Date(until) : undefined;

  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const chunks = await getReplayChunks(websiteId, replayId, { endAt, endChunkIndex });
  const allEvents = restoreReplayEventFragments(
    mergeReplayEvents(chunks, { until, endChunkIndex, endEventIndex }),
  );
  const sessionId = chunks.length > 0 ? chunks[0].sessionId : null;
  const startedAt = chunks.length > 0 ? chunks[0].startedAt : null;
  const endedAt = chunks.length > 0 ? chunks[chunks.length - 1].endedAt : null;

  return json({
    sessionId,
    events: allEvents,
    startedAt,
    endedAt,
    eventCount: allEvents.length,
    chunkCount: chunks.length,
  });
}
