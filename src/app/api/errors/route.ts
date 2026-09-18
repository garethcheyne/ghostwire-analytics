import { browserName, detectOS } from 'detect-browser';
import { z } from 'zod';
import { verifyErrorKey } from '@/lib/error-key';
import { ERROR_PLATFORMS, parseStack } from '@/lib/errors';
import { getDevice } from '@/lib/detect';
import { prisma } from '@/lib/prisma';
import { createRateLimiter } from '@/lib/rate-limit';
import { parseRequest } from '@/lib/request';
import { forbidden, tooManyRequests, unauthorized } from '@/lib/response';
import { saveError } from '@/queries/sql/errors/saveError';
import { afterResponse, notifyErrorSaved } from '@/lib/alerts';
import { recordRelease } from '@/lib/releases';
import { resolveFrames } from '@/lib/source-maps';

/*
 * Error ingest for server-side clients (@ghostwire/node, Python, .NET, or plain HTTP).
 *
 *   POST /api/errors
 *   Authorization: Bearer gwe_...   (the website's error ingest key, from its settings)
 */

const frameSchema = z.object({
  file: z.string().max(500),
  function: z.string().max(500).nullable().optional(),
  line: z.number().int().nullable().optional(),
  column: z.number().int().nullable().optional(),
  inApp: z.boolean().optional(),
});

const schema = z.object({
  website: z.uuid(),
  platform: z.enum(ERROR_PLATFORMS).default('other'),
  error: z.object({
    type: z.string().max(200).optional(),
    message: z.string().max(2000),
    stack: z.string().max(20000).optional(),
    frames: z.array(frameSchema).max(100).optional(),
  }),
  handled: z.boolean().optional(),
  /** The signed-in user, so the error shows on their page under Users. */
  user: z
    .object({
      id: z.string().max(50),
      email: z.string().max(200).optional(),
      name: z.string().max(200).optional(),
    })
    .optional(),
  /** The HTTP request being handled when the error happened. */
  request: z
    .object({
      method: z.string().max(10).optional(),
      url: z.string().max(2000).optional(),
      userAgent: z.string().max(500).optional(),
    })
    .optional(),
  environment: z.string().max(50).optional(),
  release: z.string().max(100).optional(),
  tags: z.record(z.string().max(50), z.string().max(200)).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
  breadcrumbs: z
    .array(
      z.object({
        type: z.string().max(20),
        message: z.string().max(300),
        timestamp: z.number().optional(),
      }),
    )
    .max(30)
    .optional(),
  /** Epoch milliseconds; defaults to now. */
  timestamp: z.number().int().positive().optional(),
});

const allowForWebsite = createRateLimiter({ limit: 600, windowMs: 60_000 });

function splitUrl(url: string | undefined) {
  if (!url) return { hostname: null, urlPath: null };

  try {
    const parsed = new URL(url, 'http://localhost');
    return {
      hostname: parsed.host === 'localhost' && !url.includes('localhost') ? null : parsed.host,
      // Query strings are dropped: they often carry tokens and personal data.
      urlPath: parsed.pathname,
    };
  } catch {
    return { hostname: null, urlPath: null };
  }
}

// One report is small; anything bigger is a misbehaving client.
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return Response.json({ error: { message: 'Report too large.' } }, { status: 413 });
  }

  const { body, error } = await parseRequest(request, schema, { skipAuth: true });

  if (error) {
    return error();
  }

  const key = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const website = await prisma.website.findUnique({
    where: { id: body.website },
    select: { id: true, errorsEnabled: true, errorKeyHash: true, deletedAt: true },
  });

  if (!website || website.deletedAt || !verifyErrorKey(key, website.errorKeyHash)) {
    return unauthorized({ message: 'Invalid website or error ingest key.' });
  }

  if (!website.errorsEnabled) {
    return forbidden({ message: 'Error reporting is switched off for this website.' });
  }

  if (!allowForWebsite(website.id)) {
    return tooManyRequests(60, { message: 'Too many errors; try again shortly.' });
  }

  const userAgent = body.request?.userAgent;
  const { hostname, urlPath } = splitUrl(body.request?.url);

  const given = body.error.frames?.map(frame => ({
    file: frame.file,
    function: frame.function ?? null,
    line: frame.line ?? null,
    column: frame.column ?? null,
    inApp: frame.inApp ?? true,
  }));
  const { frames } = await resolveFrames(
    website.id,
    body.release,
    given?.length ? given : parseStack(body.error.stack, body.platform),
  );

  const saved = await saveError({
    websiteId: website.id,
    source: 'server',
    platform: body.platform,
    type: body.error.type || 'Error',
    message: body.error.message,
    stack: body.error.stack,
    frames,
    distinctId: body.user?.id,
    hostname,
    urlPath,
    browser: userAgent ? browserName(userAgent) : null,
    os: userAgent ? ((detectOS(userAgent) as string) ?? null) : null,
    device: userAgent ? getDevice(userAgent) : null,
    environment: body.environment,
    release: body.release,
    context: {
      handled: body.handled ?? false,
      user: body.user,
      request: body.request && {
        method: body.request.method,
        path: urlPath,
        userAgent,
      },
      tags: body.tags,
      extra: body.extra,
      breadcrumbs: body.breadcrumbs,
    },
    createdAt: body.timestamp ? new Date(body.timestamp) : undefined,
  });

  if (body.release) {
    afterResponse(() => recordRelease(website.id, body.release, new Date(), body.environment));
  }

  afterResponse(() =>
    notifyErrorSaved({
      ...saved,
      websiteId: website.id,
      source: 'server',
      urlPath,
      release: body.release,
      environment: body.environment,
    }),
  );

  return Response.json({ ok: true, groupId: saved.groupId }, { status: 202 });
}
