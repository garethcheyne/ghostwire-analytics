import { z } from 'zod';
import { systemRoute } from '@/lib/monitoring/route';
import { getRequestSeries } from '@/queries/sql/system';

/** Requests, errors and p50/p95/p99 over time, for everything or one route ("" = no route). */
export const GET = systemRoute(
  { route: z.string().max(200).optional(), method: z.string().max(16).optional() },
  (websiteId, filters, query) =>
    getRequestSeries(websiteId, { ...filters, route: query.route, method: query.method }),
);
