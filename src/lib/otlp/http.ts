/*
 * OTLP/HTTP receiver: POST /v1/metrics and POST /v1/traces (src/app/v1/*), the paths every
 * OpenTelemetry exporter uses when given this app's URL as its endpoint.
 *
 *   Authorization: Bearer gwe_…        the website's ingest key (the same key as /api/errors)
 *   Content-Type: application/x-protobuf | application/json
 *   Content-Encoding: gzip | deflate   (optional)
 *
 * Answers follow the OTLP/HTTP spec: 200 with an Export*ServiceResponse (partial_success when some
 * points or spans were refused), 4xx/5xx with a google.rpc.Status body. 429 and 503 tell the
 * exporter to retry later; other errors are final.
 */
import { afterResponse } from '@/lib/alerts';
import { isBodyTooLarge } from '@/lib/body-limit';
import { ERROR_KEY_PREFIX, hashErrorKey, verifyErrorKey } from '@/lib/error-key';
import { log } from '@/lib/logger';
import { count as metric } from '@/lib/metrics';
import { prisma } from '@/lib/prisma';
import { createLimiter } from '@/lib/rate-limit';
import {
  decodeRequest,
  decompress,
  encodeResponse,
  encodingOf,
  errorBody,
  MAX_BODY_BYTES,
  type OtlpEncoding,
  OtlpRequestError,
  type OtlpSignal,
  RPC_CODE,
} from './decode';
import { fileSpanExceptions, ingestMetrics, ingestTraces } from './ingest';

/** Export requests per website per minute (each service sends a few: traces every 5 s, metrics every 30 s). */
export const OTLP_REQUESTS_PER_MINUTE = 1200;

const allowRequest = createLimiter({ name: 'otlp', limit: OTLP_REQUESTS_PER_MINUTE, windowMs: 60_000 });
// Shares its name with /api/errors' limiter, so span exceptions count towards the same budget.
const allowError = createLimiter({ name: 'errors', limit: 600, windowMs: 60_000 });

function answer(
  status: number,
  { body, contentType }: { body: Uint8Array | string; contentType: string },
  headers: Record<string, string> = {},
) {
  return new Response(body as BodyInit, {
    status,
    headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', ...headers },
  });
}

function fail(encoding: OtlpEncoding | null, status: number, code: number, message: string, headers = {}) {
  return answer(status, errorBody(encoding, code, message), headers);
}

/** The website an ingest key belongs to (deleted websites don't count). */
export async function websiteForKey(key: string | null | undefined) {
  if (!key || !key.startsWith(ERROR_KEY_PREFIX) || key.length > 200) return null;

  const website = await prisma.website.findFirst({
    where: { errorKeyHash: hashErrorKey(key), deletedAt: null },
    select: { id: true, errorKeyHash: true },
  });

  return website && verifyErrorKey(key, website.errorKeyHash) ? website.id : null;
}

/** Decoded request → storage, for one website. Shared by the HTTP route and self monitoring. */
export async function ingestSignal(websiteId: string, signal: OtlpSignal, decoded: any) {
  if (signal === 'metrics') return ingestMetrics(websiteId, decoded);

  const result = await ingestTraces(websiteId, decoded);
  if (result.exceptions.length) {
    afterResponse(() => fileSpanExceptions(websiteId, result.exceptions, allowError));
  }
  return result;
}

export async function handleOtlpRequest(request: Request, signal: OtlpSignal): Promise<Response> {
  const encoding = encodingOf(request.headers.get('content-type'));

  if (!encoding) {
    return fail(null, 415, RPC_CODE.invalidArgument, 'Send application/x-protobuf or application/json.');
  }

  if (await isBodyTooLarge(request, MAX_BODY_BYTES)) {
    metric(`otlp.${signal}.too_large`);
    return fail(encoding, 413, RPC_CODE.invalidArgument, 'Export request too large.');
  }

  const key = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const websiteId = await websiteForKey(key);

  if (!websiteId) {
    metric(`otlp.${signal}.unauthorized`);
    return fail(encoding, 401, RPC_CODE.unauthenticated, 'Missing or invalid ingest key.');
  }

  if (!(await allowRequest(websiteId))) {
    metric(`otlp.${signal}.rate_limited`);
    return fail(encoding, 429, RPC_CODE.resourceExhausted, 'Too many export requests; try again shortly.', {
      'Retry-After': '30',
    });
  }

  let decoded: any;

  try {
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > MAX_BODY_BYTES) throw new OtlpRequestError('Export request too large.', 413);
    decoded = decodeRequest(signal, encoding, decompress(body, request.headers.get('content-encoding')));
  } catch (error) {
    const status = error instanceof OtlpRequestError ? error.status : 400;
    const message = error instanceof OtlpRequestError ? error.message : 'Unreadable export request.';
    metric(`otlp.${signal}.invalid`);
    return fail(encoding, status, RPC_CODE.invalidArgument, message);
  }

  try {
    const result = await ingestSignal(websiteId, signal, decoded);
    metric(`otlp.${signal}.accepted`);
    return answer(200, encodeResponse(signal, encoding, result.rejected, result.message));
  } catch (error) {
    log.error('otlp.ingest_failed', { signal, websiteId, error });
    metric(`otlp.${signal}.failed`);
    // 503 is retryable: the exporter keeps the batch and tries again.
    return fail(encoding, 503, RPC_CODE.internal, 'Could not store the data; try again shortly.', {
      'Retry-After': '30',
    });
  }
}
