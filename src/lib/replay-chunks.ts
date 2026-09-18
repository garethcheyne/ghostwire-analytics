/** Server-side helpers for turning stored replay chunks into a player's event list. */
import type { getReplayChunks } from '@/queries/sql';

function getEventTimestamp(event: any): number | null {
  const timestamp = Number(event?.timestamp);

  return Number.isFinite(timestamp) ? timestamp : null;
}

export function parseOptionalInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : undefined;
}

export function mergeReplayEvents(
  chunks: Awaited<ReturnType<typeof getReplayChunks>>,
  {
    until,
    endChunkIndex,
    endEventIndex,
  }: { until?: number; endChunkIndex?: number; endEventIndex?: number },
) {
  const events: any[] = [];
  let isSorted = true;
  let lastTimestamp = -Infinity;

  for (const chunk of chunks) {
    if (endChunkIndex !== undefined && chunk.chunkIndex > endChunkIndex) {
      continue;
    }

    for (let chunkEventIndex = 0; chunkEventIndex < chunk.events.length; chunkEventIndex++) {
      const event = chunk.events[chunkEventIndex];
      const timestamp = getEventTimestamp(event);

      if (chunk.chunkIndex === endChunkIndex && endEventIndex !== undefined) {
        if (chunkEventIndex > endEventIndex) {
          continue;
        }
      }

      if (until !== undefined && timestamp !== null && timestamp > until) {
        continue;
      }

      if (timestamp !== null) {
        if (timestamp < lastTimestamp) {
          isSorted = false;
        } else {
          lastTimestamp = timestamp;
        }
      }

      events.push(event);
    }
  }

  if (!isSorted) {
    events.sort((a, b) => (getEventTimestamp(a) ?? 0) - (getEventTimestamp(b) ?? 0));
  }

  return events;
}
