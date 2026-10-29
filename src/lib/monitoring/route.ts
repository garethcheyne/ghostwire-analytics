import { z } from 'zod';
import { parseRequest } from '@/lib/request';
import { badRequest, json, unauthorized } from '@/lib/response';
import { canViewAuthenticatedWebsite } from '@/permissions';
import type { SystemFilters } from '@/queries/sql/system';

type Params = { params: Promise<Record<string, string>> };

/** Longest date range the System pages accept (the hourly rollups' default retention). */
const MAX_RANGE_MS = 400 * 24 * 60 * 60 * 1000;

const base = {
  startAt: z.coerce.number().int().nonnegative(),
  endAt: z.coerce.number().int().positive(),
  serviceId: z.uuid().optional(),
};

/**
 * A GET handler for /api/websites/[websiteId]/system/*: checks the date range and that the caller
 * may see the website's authenticated-only data (span attributes and statements aren't for share
 * links), then runs `handler`.
 */
export function systemRoute<T extends z.ZodRawShape>(
  shape: T,
  handler: (
    websiteId: string,
    filters: SystemFilters,
    query: z.infer<z.ZodObject<typeof base & T>>,
    params: Record<string, string>,
  ) => Promise<unknown>,
) {
  const schema = z.object({ ...base, ...shape });

  return async function GET(request: Request, { params }: Params) {
    const { auth, query, error } = await parseRequest(request, schema);
    if (error) return error();

    const resolved = await params;
    const { websiteId } = resolved;

    if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
      return unauthorized();
    }

    if (query.endAt <= query.startAt || query.endAt - query.startAt > MAX_RANGE_MS) {
      return badRequest({ message: 'Choose a date range of up to 400 days.' });
    }

    // Presets end at the end of the hour or day; rates are per minute that has happened.
    const end = Math.min(query.endAt, Date.now());
    const filters: SystemFilters = {
      startDate: new Date(Math.min(query.startAt, end - 60_000)),
      endDate: new Date(end),
      serviceId: query.serviceId,
    };

    return json(await handler(websiteId, filters, query, resolved));
  };
}
