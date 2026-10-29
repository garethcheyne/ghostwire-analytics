'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useDateRange } from '@/hooks/use-date-range';
import { api } from '@/lib/api-client';
import type {
  DependencyRow,
  EndpointRow,
  JobRow,
  RequestPoint,
  RequestStats,
  StatementRow,
  SystemService,
  TraceSpan,
  TraceSummary,
} from '@/queries/sql/system';
import type { ContainerStats, HostStats } from '@/lib/monitoring/infrastructure';

export type {
  ContainerStats,
  DependencyRow,
  EndpointRow,
  HostStats,
  JobRow,
  RequestPoint,
  RequestStats,
  StatementRow,
  SystemService,
  TraceSpan,
  TraceSummary,
};

/** Monitoring data changes by the minute: refetch while the page is open. */
const REFRESH_MS = 60_000;

export interface Series<T> {
  bucketSeconds: number;
  points: T[];
}

export interface SystemOverview {
  services: (SystemService & { requests: RequestStats | null })[];
  totals: RequestStats | null;
  series: Series<RequestPoint>;
  resources: {
    hostCpuPercent: number | null;
    hostMemoryPercent: number | null;
    containerCpuPercent: number;
    containerMemoryBytes: number;
    containers: number;
    hosts: number;
  };
}

export interface Infrastructure {
  containers: ContainerStats[];
  hosts: HostStats[];
  series: Series<{
    t: number;
    containers: Record<string, { cpu: number | null; memory: number | null; memoryPercent: number | null }>;
    hosts: Record<string, { cpu: number | null; memory: number | null }>;
  }>;
}

/** The service picked in the page's service filter (?service=<id>). */
export function useServiceFilter() {
  return useSearchParams().get('service') || undefined;
}

function useSystemParams(extra: Record<string, string | number | undefined> = {}) {
  const { params } = useDateRange();
  const serviceId = useServiceFilter();
  return { startAt: params.startAt, endAt: params.endAt, serviceId, ...extra };
}

function useSystemQuery<T>(websiteId: string, path: string, params: Record<string, unknown>) {
  return useQuery({
    queryKey: ['system', websiteId, path, params],
    queryFn: () => api.get<T>(`/websites/${websiteId}/system/${path}`, params as any),
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  });
}

export function useSystemServices(websiteId: string) {
  return useQuery({
    queryKey: ['system', websiteId, 'services'],
    queryFn: () => api.get<SystemService[]>(`/websites/${websiteId}/system/services`),
    refetchInterval: REFRESH_MS,
  });
}

export function useSystemOverview(websiteId: string) {
  return useSystemQuery<SystemOverview>(websiteId, 'overview', useSystemParams());
}

export function useEndpoints(websiteId: string) {
  return useSystemQuery<EndpointRow[]>(websiteId, 'endpoints', useSystemParams());
}

/** One endpoint's series (its service, route and method), or every endpoint's. */
export function useEndpointSeries(
  websiteId: string,
  endpoint?: { serviceId: string; route: string | null; method: string | null } | null,
) {
  const extra = endpoint
    ? { serviceId: endpoint.serviceId, route: endpoint.route ?? '', method: endpoint.method ?? undefined }
    : {};
  return useSystemQuery<Series<RequestPoint>>(websiteId, 'endpoints/series', useSystemParams(extra));
}

export interface TraceFilters {
  route?: string;
  status?: 'error' | 'ok';
  minDurationMs?: number;
  search?: string;
  sort?: 'recent' | 'slowest';
  page?: number;
}

export function useTraces(websiteId: string, filters: TraceFilters) {
  return useSystemQuery<{ data: TraceSummary[]; count: number; page: number; pageSize: number }>(
    websiteId,
    'traces',
    useSystemParams({ ...filters, pageSize: 50 }),
  );
}

export function useTrace(websiteId: string, traceId: string) {
  return useQuery({
    queryKey: ['system', websiteId, 'trace', traceId],
    queryFn: () =>
      api.get<{ traceId: string; spans: TraceSpan[] }>(`/websites/${websiteId}/system/traces/${traceId}`),
  });
}

export function useDependencies(websiteId: string) {
  return useSystemQuery<{
    dependencies: DependencyRow[];
    statements: StatementRow[];
    series: Series<{ t: number; calls: number; errors: number; p95: number | null }>;
  }>(websiteId, 'dependencies', useSystemParams());
}

export function useJobs(websiteId: string) {
  return useSystemQuery<{ jobs: JobRow[]; series: Series<{ t: number; runs: number; failures: number }> }>(
    websiteId,
    'jobs',
    useSystemParams(),
  );
}

export function useInfrastructure(websiteId: string) {
  return useSystemQuery<Infrastructure>(websiteId, 'infrastructure', useSystemParams());
}
