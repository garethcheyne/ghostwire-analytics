import { systemRoute } from '@/lib/monitoring/route';
import { getSystemOverview } from '@/queries/sql/system';

/** Services with status and request figures, totals, a request series and the CPU/memory headline. */
export const GET = systemRoute({}, (websiteId, filters) => getSystemOverview(websiteId, filters));
