import { systemRoute } from '@/lib/monitoring/route';
import { getJobs } from '@/queries/sql/system';

/** Background jobs: runs, failures, duration, last run, and runs over time. */
export const GET = systemRoute({}, (websiteId, filters) => getJobs(websiteId, filters));
