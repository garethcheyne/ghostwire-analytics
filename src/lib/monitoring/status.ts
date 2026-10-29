/*
 * Whether a service is up. Services export metrics on a schedule (the SDKs every 30 s, the
 * Collector every 30-60 s); Analytics learns each one's usual interval (a moving average) and
 * calls it down once it has been silent for three intervals (at least two minutes). A worker that
 * sends ghostwire.heartbeat is also down when its heartbeat stops even if its process keeps
 * exporting other metrics (a stuck loop). Services that only send traces have no schedule: they're
 * "idle" after a quiet spell rather than down.
 */

export type ServiceStatus = 'up' | 'down' | 'idle';

export interface ServiceTimes {
  lastSeen: Date | string;
  lastMetricsAt: Date | string | null;
  lastHeartbeatAt: Date | string | null;
  intervalSeconds: number | null;
}

export const MIN_DOWN_AFTER_SECONDS = 120;
export const IDLE_AFTER_SECONDS = 15 * 60;
const DEFAULT_INTERVAL_SECONDS = 60;

const time = (value: Date | string | null) => (value ? new Date(value).getTime() : null);

/** Seconds of silence after which the service counts as down. */
export function downAfterSeconds(intervalSeconds: number | null) {
  const interval = Math.min(Math.max(intervalSeconds ?? DEFAULT_INTERVAL_SECONDS, 10), 900);
  return Math.max(3 * interval + 30, MIN_DOWN_AFTER_SECONDS);
}

export function serviceStatus(service: ServiceTimes, now = Date.now()): { status: ServiceStatus; reason?: string; downSince?: number } {
  const limit = downAfterSeconds(service.intervalSeconds) * 1000;
  const metricsAt = time(service.lastMetricsAt);
  const heartbeatAt = time(service.lastHeartbeatAt);

  if (metricsAt === null) {
    const seen = time(service.lastSeen) ?? 0;
    return now - seen > IDLE_AFTER_SECONDS * 1000 ? { status: 'idle', reason: 'No recent traces' } : { status: 'up' };
  }

  if (now - metricsAt > limit) {
    return { status: 'down', reason: 'Stopped reporting', downSince: metricsAt };
  }

  if (heartbeatAt !== null && now - heartbeatAt > limit) {
    return { status: 'down', reason: 'Heartbeat stopped', downSince: heartbeatAt };
  }

  return { status: 'up' };
}
