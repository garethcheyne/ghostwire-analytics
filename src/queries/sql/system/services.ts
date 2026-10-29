import { serviceStatus, type ServiceStatus } from '@/lib/monitoring/status';
import { run } from './common';

export type ServiceKind = 'app' | 'container' | 'host' | 'collector';

export interface SystemService {
  id: string;
  namespace: string;
  name: string;
  version: string | null;
  environment: string | null;
  language: string | null;
  kind: ServiceKind;
  firstSeen: string;
  lastSeen: string;
  lastMetricsAt: string | null;
  lastHeartbeatAt: string | null;
  intervalSeconds: number | null;
  status: ServiceStatus;
  statusReason?: string;
  downSince?: number;
}

/**
 * Every service that has reported to the website, with up/down status. Collector data is told
 * apart by what it sends: container.* metrics (one service per container), system.* (the host).
 */
export async function getSystemServices(websiteId: string, now = Date.now()): Promise<SystemService[]> {
  const rows = await run<any>(
    `
    select s.service_id as "id", s.namespace, s.name, s.version, s.environment, s.language,
      s.first_seen as "firstSeen", s.last_seen as "lastSeen", s.last_metrics_at as "lastMetricsAt",
      s.last_heartbeat_at as "lastHeartbeatAt", s.interval_seconds as "intervalSeconds",
      exists (
        select 1 from monitor_metric_minute m
        where m.website_id = s.website_id and m.service_id = s.service_id
          and m.metric like 'container.%' and m.bucket > s.last_seen - interval '1 day'
      ) as "isContainer",
      exists (
        select 1 from monitor_metric_minute m
        where m.website_id = s.website_id and m.service_id = s.service_id
          and m.metric like 'system.%' and m.bucket > s.last_seen - interval '1 day'
      ) as "isHost"
    from monitor_service s
    where s.website_id = {{websiteId::uuid}}
    order by s.namespace, s.name
    `,
    { websiteId },
    'getSystemServices',
  );

  return rows.map(({ isContainer, isHost, ...row }) => {
    const { status, reason, downSince } = serviceStatus(row, now);
    const kind: ServiceKind = isContainer
      ? 'container'
      : isHost
        ? 'host'
        : row.name === 'otel-collector'
          ? 'collector'
          : 'app';

    return {
      ...row,
      intervalSeconds: row.intervalSeconds === null ? null : Number(row.intervalSeconds),
      kind,
      status,
      statusReason: reason,
      downSince,
    };
  });
}
