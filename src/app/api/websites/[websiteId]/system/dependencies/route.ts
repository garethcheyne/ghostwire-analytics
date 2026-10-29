import { systemRoute } from '@/lib/monitoring/route';
import { getDependencies } from '@/queries/sql/system';

/** Database and outside calls, the slowest statements, and calls over time. */
export const GET = systemRoute({}, (websiteId, filters) => getDependencies(websiteId, filters));
