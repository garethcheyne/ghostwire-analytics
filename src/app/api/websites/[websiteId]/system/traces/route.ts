import { z } from 'zod';
import { systemRoute } from '@/lib/monitoring/route';
import { getTraces } from '@/queries/sql/system';

/** Requests and job runs (entry spans), filtered and paged. */
export const GET = systemRoute(
  {
    route: z.string().max(200).optional(),
    status: z.enum(['error', 'ok']).optional(),
    minDurationMs: z.coerce.number().nonnegative().max(86_400_000).optional(),
    search: z.string().max(200).optional(),
    sort: z.enum(['recent', 'slowest']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
  },
  (websiteId, filters, query) => getTraces(websiteId, { ...query, ...filters }),
);
