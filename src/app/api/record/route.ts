import { isbot } from 'isbot';
import { serializeError } from 'serialize-error';
import { z } from 'zod';
import { HEATMAP_EVENT_TYPE } from '@/lib/constants';
import { corsPreflight, withCorsHeaders } from '@/lib/cors';
import { secret } from '@/lib/crypto';
import { getClientInfo, hasBlockedIp } from '@/lib/detect';
import { parseToken } from '@/lib/jwt';
import { getRecorderConfig } from '@/lib/recorder';
import { getReplayEventCount } from '@/lib/replay';
import { parseRequest } from '@/lib/request';
import { createIpRateLimiter } from '@/lib/rate-limit';
import {
  badRequest,
  forbidden,
  json,
  payloadTooLarge,
  serverError,
  tooManyRequests,
} from '@/lib/response';
import { getWebsite } from '@/queries/prisma';
import { saveRecording } from '@/queries/sql';
import { saveHeatmapEvents } from '@/queries/sql/heatmap/saveHeatmapEvents';

interface Cache {
  sessionId: string;
  visitId: string;
}

const MAX_RECORD_REQUEST_BYTES = 1_000_000;

const schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('record'),
    payload: z.object({
      website: z.uuid(),
      events: z.array(z.any()).max(200),
      timestamp: z.coerce.number().int().optional(),
    }),
  }),
  z.object({
    type: z.literal('heatmap'),
    payload: z.object({
      website: z.uuid(),
      events: z
        .array(
          z.discriminatedUnion('type', [
            z.object({
              type: z.literal(['click', 'dead']),
              url: z.string(),
              x: z.coerce.number().optional(),
              y: z.coerce.number().optional(),
              pageX: z.coerce.number().optional(),
              pageY: z.coerce.number().optional(),
              pageW: z.coerce.number().optional(),
              pageH: z.coerce.number().optional(),
              viewportW: z.coerce.number().optional(),
              viewportH: z.coerce.number().optional(),
              timestamp: z.coerce.number().int().optional(),
            }),
            z.object({
              type: z.literal('scroll'),
              url: z.string(),
              scrollPct: z.coerce.number().optional(),
              pageW: z.coerce.number().optional(),
              pageH: z.coerce.number().optional(),
              viewportW: z.coerce.number().optional(),
              viewportH: z.coerce.number().optional(),
              timestamp: z.coerce.number().int().optional(),
            }),
          ]),
        )
        .max(200),
      timestamp: z.coerce.number().int().optional(),
    }),
  }),
]);

function getUrlPath(url: string) {
  try {
    return new URL(url).pathname || '/';
  } catch {
    return url.startsWith('/') ? url.split(/[?#]/)[0] || '/' : '/';
  }
}

async function getRequestBodySize(request: Request): Promise<number | null> {
  const contentLength = request.headers.get('content-length');

  if (contentLength) {
    const size = Number(contentLength);

    if (Number.isFinite(size)) {
      return size;
    }
  }

  try {
    const text = await request.clone().text();

    return new TextEncoder().encode(text).length;
  } catch {
    return null;
  }
}

export function OPTIONS() {
  return corsPreflight();
}

// Per-IP cap on replay uploads (the recorder batches every few seconds).
const allowForIp = createIpRateLimiter({ name: 'record', limit: 240, windowMs: 60_000 });

export async function POST(request: Request) {
  try {
    if (!(await allowForIp(request))) {
      return withCorsHeaders(tooManyRequests());
    }

    const requestBodySize = await getRequestBodySize(request);

    if (requestBodySize && requestBodySize > MAX_RECORD_REQUEST_BYTES) {
      return withCorsHeaders(
        payloadTooLarge({
          reason: 'payload_too_large',
          maxBytes: MAX_RECORD_REQUEST_BYTES,
          size: requestBodySize,
        }),
      );
    }

    const { body, error } = await parseRequest(request, schema, { skipAuth: true });

    if (error) {
      return withCorsHeaders(error());
    }

    const { website: websiteId } = body.payload;
    const events = body.payload.events;
    const timestamp = body.payload.timestamp;

    if (!events?.length) {
      return withCorsHeaders(json({ ok: true }));
    }

    // Parse cache token to get session info
    const cacheHeader = request.headers.get('x-ghostwire-cache');

    if (!cacheHeader) {
      return withCorsHeaders(badRequest({ message: 'Missing session token.' }));
    }

    const cache = (await parseToken(cacheHeader, secret())) as Cache | null;

    if (!cache?.sessionId || !cache?.visitId) {
      return withCorsHeaders(badRequest({ message: 'Invalid session token.' }));
    }

    const { sessionId, visitId } = cache;

    // Query directly to avoid stale Redis cache for recorderEnabled
    const website = await getWebsite(websiteId);

    if (!website) {
      return withCorsHeaders(badRequest({ message: 'Website not found.' }));
    }

    const recorderConfig = getRecorderConfig(website.replayConfig);
    const replayEnabled = recorderConfig.replayEnabled === true;
    const heatmapEnabled = recorderConfig.heatmapEnabled === true;

    if (!website.recorderEnabled) {
      return withCorsHeaders(json({ ok: false, reason: 'recorder_disabled' }));
    }

    // Client info for bot/IP checks
    const { ip, userAgent } = await getClientInfo(request, {});

    if (!process.env.DISABLE_BOT_CHECK && isbot(userAgent)) {
      return withCorsHeaders(json({ beep: 'boop' }));
    }

    if (hasBlockedIp(ip)) {
      return withCorsHeaders(forbidden());
    }

    if (body.type === 'record') {
      if (!replayEnabled) {
        return withCorsHeaders(json({ ok: false, reason: 'replay_disabled' }));
      }

      const eventTimestamps = events
        .map((e: any) => Number(e?.timestamp))
        .filter((t: number) => Number.isFinite(t) && t > 0);

      const fallbackMs = (timestamp || Math.floor(Date.now() / 1000)) * 1000;
      const minTimestamp = eventTimestamps.length ? Math.min(...eventTimestamps) : fallbackMs;
      const maxTimestamp = eventTimestamps.length ? Math.max(...eventTimestamps) : fallbackMs;

      const startedAt = new Date(minTimestamp);
      const endedAt = new Date(maxTimestamp);
      const chunkIndex = timestamp || Math.floor(Date.now() / 1000);

      await saveRecording({
        websiteId,
        sessionId,
        visitId,
        chunkIndex,
        events,
        eventCount: getReplayEventCount(events),
        startedAt,
        endedAt,
      });

      return withCorsHeaders(json({ ok: true }));
    }

    if (!heatmapEnabled) {
      return withCorsHeaders(json({ ok: false, reason: 'heatmap_disabled' }));
    }

    try {
      const fallbackMs = (timestamp || Math.floor(Date.now() / 1000)) * 1000;
      const heatmapRows = events.map(event => ({
        websiteId,
        sessionId,
        visitId,
        eventType:
          event.type === 'click'
            ? HEATMAP_EVENT_TYPE.click
            : event.type === 'dead'
              ? HEATMAP_EVENT_TYPE.deadClick
              : HEATMAP_EVENT_TYPE.scroll,
        x: event.type !== 'scroll' ? (event.x ?? null) : null,
        y: event.type !== 'scroll' ? (event.y ?? null) : null,
        pageX: event.type !== 'scroll' ? (event.pageX ?? null) : null,
        pageY: event.type !== 'scroll' ? (event.pageY ?? null) : null,
        pageW: event.pageW ?? null,
        viewportW: event.viewportW ?? null,
        viewportH: event.viewportH ?? null,
        pageH: event.pageH ?? null,
        scrollPct: event.type === 'scroll' ? (event.scrollPct ?? null) : null,
        urlPath: getUrlPath(event.url),
        createdAt: new Date(event.timestamp ?? fallbackMs),
      }));

      if (heatmapRows.length) {
        await saveHeatmapEvents(heatmapRows);
      }
    } catch (e) {
      console.log('heatmap save failed', serializeError(e));
    }

    return withCorsHeaders(json({ ok: true }));
  } catch (e) {
    return withCorsHeaders(serverError(e));
  }
}
