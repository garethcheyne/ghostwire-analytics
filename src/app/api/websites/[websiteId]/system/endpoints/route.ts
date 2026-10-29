import { systemRoute } from '@/lib/monitoring/route';
import { getEndpoints } from '@/queries/sql/system';

/** Requests, error rate and latency percentiles per service, route and method. */
export const GET = systemRoute({}, (websiteId, filters) => getEndpoints(websiteId, filters));
