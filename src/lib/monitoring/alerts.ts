/*
 * Alert rules on system monitoring data, checked with the other scheduled alerts (every 5 minutes)
 * and sent through the same channels:
 *   system.latency     a service's p95 request time above `ms` over the last `minutes`
 *   system.error_rate  a service's server errors above `percent` of requests over `minutes`
 *                      (only with at least `minimum` requests, so one failure of two isn't 50 %)
 *   system.down        a service that stopped reporting (or heartbeating) `minutes` ago or more
 *   system.job_failure at least `count` failed job runs within `minutes`
 *   system.cpu         a container or host averaging above `percent` CPU over `minutes`
 *   system.memory      a container or host above `percent` memory (latest reading)
 * Each rule fires at most once per cooldown while the condition lasts (six hours for a service
 * that is down, an hour otherwise); `last_triggered_at` claims it, as for the other alerts.
 */
import { appUrl, type Notification } from '@/lib/notify';
import { getInfrastructure, getJobs, getRequestTotals, getSystemServices } from '@/queries/sql/system';

export const SYSTEM_ALERT_DEFAULTS = {
  'system.latency': { ms: 1000, minutes: 5 },
  'system.error_rate': { percent: 5, minutes: 5, minimum: 20 },
  'system.down': { minutes: 5 },
  'system.job_failure': { count: 1, minutes: 15 },
  'system.cpu': { percent: 90, minutes: 10 },
  'system.memory': { percent: 90, minutes: 5 },
} as const satisfies Record<string, Record<string, number>>;

export type SystemAlertType = keyof typeof SYSTEM_ALERT_DEFAULTS;
export const SYSTEM_ALERT_TYPES = Object.keys(SYSTEM_ALERT_DEFAULTS) as SystemAlertType[];

/** Parameters that are percentages (must stay at or below 100). */
export const PERCENT_PARAMS = new Set(['percent']);

const HOUR_MS = 60 * 60 * 1000;
export const SYSTEM_ALERT_COOLDOWN_MS: Record<SystemAlertType, number> = {
  'system.latency': HOUR_MS,
  'system.error_rate': HOUR_MS,
  'system.down': 6 * HOUR_MS,
  'system.job_failure': HOUR_MS,
  'system.cpu': HOUR_MS,
  'system.memory': HOUR_MS,
};

const ms = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`);
const pct = (value: number) => `${value.toFixed(value < 10 ? 1 : 0)}%`;
const list = (items: string[]) => (items.length > 5 ? `${items.slice(0, 5).join(', ')} and ${items.length - 5} more` : items.join(', '));

/**
 * What's wrong for this rule right now, as a notification without the website name, or null when
 * everything is within the thresholds.
 */
export async function evaluateSystemAlert(
  websiteId: string,
  type: SystemAlertType,
  params: Record<string, number>,
  now = Date.now(),
): Promise<Omit<Notification, 'title'> & { subject: string } | null> {
  const minutes = params.minutes ?? 5;
  const filters = { startDate: new Date(now - minutes * 60_000), endDate: new Date(now) };
  const page = (path: string) => appUrl(`/websites/${websiteId}/system${path}`);

  if (type === 'system.down') {
    const down = (await getSystemServices(websiteId, now)).filter(
      s => s.status === 'down' && s.downSince !== undefined && now - s.downSince >= minutes * 60_000,
    );
    if (!down.length) return null;
    return {
      event: type,
      level: 'danger',
      subject: `${down.length === 1 ? `${down[0].name} is` : `${down.length} services are`} down`,
      text: down
        .map(s => `${s.namespace ? `${s.namespace} / ` : ''}${s.name}: ${s.statusReason ?? 'down'}, last heard from ${new Date(s.downSince!).toISOString()}`)
        .join('\n'),
      url: page(''),
      fields: [{ name: 'Services', value: list(down.map(s => s.name)) }],
      data: { websiteId, services: down.map(s => ({ id: s.id, name: s.name, namespace: s.namespace })) },
    };
  }

  if (type === 'system.latency' || type === 'system.error_rate') {
    const [{ byService }, services] = await Promise.all([
      getRequestTotals(websiteId, filters),
      getSystemServices(websiteId, now),
    ]);
    const name = (id: string) => services.find(s => s.id === id)?.name ?? 'unknown service';
    const breaches = [...byService].flatMap(([id, stats]) => {
      if (type === 'system.latency') {
        return stats.p95 !== null && stats.p95 > params.ms ? [`${name(id)}: p95 ${ms(stats.p95)}`] : [];
      }
      const rate = stats.errorRate ?? 0;
      return stats.count >= (params.minimum ?? 1) && rate * 100 > params.percent
        ? [`${name(id)}: ${pct(rate * 100)} of ${stats.count} requests failed`]
        : [];
    });
    if (!breaches.length) return null;
    return {
      event: type,
      level: type === 'system.error_rate' ? 'danger' : 'warning',
      subject:
        type === 'system.latency'
          ? `Slow responses (p95 above ${ms(params.ms)})`
          : `Server errors above ${pct(params.percent)}`,
      text: `${breaches.join('\n')}\nOver the last ${minutes} minutes.`,
      url: page('/endpoints'),
      data: { websiteId, minutes, breaches },
    };
  }

  if (type === 'system.job_failure') {
    const failing = (await getJobs(websiteId, filters)).jobs.filter(j => j.failures >= params.count);
    if (!failing.length) return null;
    return {
      event: type,
      level: 'danger',
      subject: `${failing.length === 1 ? `Job ${failing[0].job}` : `${failing.length} jobs`} failing`,
      text: failing
        .map(j => `${j.job}: ${j.failures} of ${j.runs} runs failed${j.lastFailure ? ` (${j.lastFailure})` : ''}`)
        .join('\n'),
      url: page('/jobs'),
      data: { websiteId, minutes, jobs: failing.map(j => ({ job: j.job, failures: j.failures, runs: j.runs })) },
    };
  }

  // CPU or memory, for containers and hosts.
  const { containers, hosts } = await getInfrastructure(websiteId, filters);
  const value = (entity: { cpuPercent: number | null; memoryPercent: number | null }) =>
    type === 'system.cpu' ? entity.cpuPercent : entity.memoryPercent;
  const over = [
    ...containers.map(c => ({ name: c.name, value: value(c) })),
    ...hosts.map(h => ({ name: `host ${h.name}`, value: value(h) })),
  ].filter((e): e is { name: string; value: number } => e.value !== null && e.value > params.percent);

  if (!over.length) return null;
  const what = type === 'system.cpu' ? 'CPU' : 'Memory';
  return {
    event: type,
    level: 'warning',
    subject: `${what} above ${pct(params.percent)}: ${list(over.map(e => e.name))}`,
    text: over.map(e => `${e.name}: ${pct(e.value)}`).join('\n'),
    url: page('/infrastructure'),
    data: { websiteId, minutes, over },
  };
}
