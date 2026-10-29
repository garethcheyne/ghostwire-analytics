import { systemRoute } from '@/lib/monitoring/route';
import { getInfrastructure } from '@/queries/sql/system';

/** Containers and hosts (Collector metrics), with CPU and memory over time. */
export const GET = systemRoute({}, (websiteId, filters) => getInfrastructure(websiteId, filters));
