/*
 * System monitoring queries (OpenTelemetry data from /v1/metrics and /v1/traces). Every value
 * written into SQL text is a checked table name, a checked integer or a fixed string; everything
 * else is a bound parameter.
 */
import { getInfrastructure } from './infrastructure';
import { getRequestSeries, getRequestTotals } from './requests';
import { getSystemServices } from './services';
import type { SystemFilters } from './common';

export * from './dependencies';
export * from './infrastructure';
export * from './jobs';
export * from './requests';
export * from './services';
export * from './traces';
export type { SystemFilters } from './common';

/** The overview: services with status and request figures, totals, a series, CPU/memory headline. */
export async function getSystemOverview(websiteId: string, filters: SystemFilters) {
  const [services, totals, series, infrastructure] = await Promise.all([
    getSystemServices(websiteId),
    getRequestTotals(websiteId, filters),
    getRequestSeries(websiteId, filters),
    getInfrastructure(websiteId, filters),
  ]);

  const average = (values: (number | null)[]) => {
    const known = values.filter((v): v is number => v !== null && Number.isFinite(v));
    return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  };

  return {
    services: services
      .filter(s => !filters.serviceId || s.id === filters.serviceId)
      .map(s => ({ ...s, requests: totals.byService.get(s.id) ?? null })),
    totals: totals.total,
    series,
    resources: {
      hostCpuPercent: average(infrastructure.hosts.map(h => h.cpuPercent)),
      hostMemoryPercent: average(infrastructure.hosts.map(h => h.memoryPercent)),
      containerCpuPercent: infrastructure.containers.reduce((sum, c) => sum + (c.cpuPercent ?? 0), 0),
      containerMemoryBytes: infrastructure.containers.reduce((sum, c) => sum + (c.memoryBytes ?? 0), 0),
      containers: infrastructure.containers.length,
      hosts: infrastructure.hosts.length,
    },
  };
}
