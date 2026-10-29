/*
 * Container and host figures from the Collector's docker_stats and host_metrics receivers, worked
 * out from rollup rows aggregated over a period (the whole date range, or one chart bucket):
 *
 *   container CPU %      container.cpu.utilization, else container.cpu.usage.total (ns of CPU per
 *                        second of wall time; 100 % = one core)
 *   container memory     container.memory.usage.total / .usage.limit (or container.memory.percent)
 *   container network    container.network.io.usage.rx_bytes / tx_bytes
 *   restarts, uptime     container.restarts, container.uptime
 *   host CPU %           system.cpu.utilization (1 - idle), else system.cpu.time by state
 *   host memory %        system.memory.utilization (used), else system.memory.usage by state
 *   disks                system.filesystem.utilization (or .usage) per mountpoint
 *   load                 system.cpu.load_average.1m / 5m / 15m
 */

export interface InfraRow {
  metric: string;
  attrs: Record<string, unknown>;
  /** Total (counters) or sum of readings (gauges). */
  sum: number;
  /** Points (counters) or readings (gauges). */
  count: number;
  max: number | null;
  /** The latest reading (gauges). */
  last: number | null;
  /** Minutes with data, to turn counter totals into rates. */
  minutes: number;
  /** Latest bucket with data, epoch ms. */
  lastAt: number;
}

export interface ContainerStats {
  name: string;
  cpuPercent: number | null;
  memoryBytes: number | null;
  memoryLimitBytes: number | null;
  memoryPercent: number | null;
  networkRxBytes: number;
  networkTxBytes: number;
  blockReadBytes: number;
  blockWriteBytes: number;
  restarts: number;
  uptimeSeconds: number | null;
  lastSeen: number;
}

export interface DiskStats {
  mountpoint: string;
  usedPercent: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
}

export interface HostStats {
  name: string;
  cpuPercent: number | null;
  memoryPercent: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  networkRxBytes: number;
  networkTxBytes: number;
  disks: DiskStats[];
  lastSeen: number;
}

const avg = (rows: InfraRow[]) => {
  const count = rows.reduce((n, r) => n + r.count, 0);
  return count ? rows.reduce((n, r) => n + r.sum, 0) / count : null;
};
const total = (rows: InfraRow[]) => rows.reduce((n, r) => n + r.sum, 0);
const latest = (rows: InfraRow[]) =>
  rows.filter(r => r.last !== null).sort((a, b) => b.lastAt - a.lastAt)[0]?.last ?? null;
const str = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
/** Ratios (0-1) as percentages; values already in percent pass through. */
const percent = (value: number | null) => (value === null ? null : value <= 1.0001 ? value * 100 : value);

function groupBy(rows: InfraRow[], key: (row: InfraRow) => string) {
  const groups = new Map<string, InfraRow[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

function container(name: string, rows: InfraRow[]): ContainerStats {
  const of = (metric: string) => rows.filter(r => r.metric === metric);
  const usage = of('container.cpu.usage.total');
  const minutes = Math.max(...usage.map(r => r.minutes), 0);
  const utilization = avg(of('container.cpu.utilization'));
  const memory = latest(of('container.memory.usage.total'));
  const limit = latest(of('container.memory.usage.limit'));
  const memPercent = latest(of('container.memory.percent'));
  const block = of('container.blockio.io_service_bytes_recursive');

  return {
    name,
    cpuPercent:
      utilization ?? (usage.length && minutes ? (total(usage) / (minutes * 60 * 1e9)) * 100 : null),
    memoryBytes: memory,
    memoryLimitBytes: limit,
    memoryPercent: memPercent ?? (memory !== null && limit ? (memory / limit) * 100 : null),
    networkRxBytes: total(of('container.network.io.usage.rx_bytes')),
    networkTxBytes: total(of('container.network.io.usage.tx_bytes')),
    blockReadBytes: total(block.filter(r => str(r.attrs.operation).toLowerCase() === 'read')),
    blockWriteBytes: total(block.filter(r => str(r.attrs.operation).toLowerCase() === 'write')),
    restarts: total(of('container.restarts')),
    uptimeSeconds: latest(of('container.uptime')),
    lastSeen: Math.max(...rows.map(r => r.lastAt)),
  };
}

function hostCpu(rows: InfraRow[]) {
  const utilization = rows.filter(r => r.metric === 'system.cpu.utilization');
  if (utilization.length) {
    const idle = avg(utilization.filter(r => str(r.attrs.state) === 'idle'));
    if (idle !== null) return (1 - idle) * 100;
  }
  const time = rows.filter(r => r.metric === 'system.cpu.time');
  const all = total(time);
  if (!all) return null;
  return (1 - total(time.filter(r => str(r.attrs.state) === 'idle')) / all) * 100;
}

function host(name: string, rows: InfraRow[]): HostStats {
  const of = (metric: string) => rows.filter(r => r.metric === metric);
  const usage = groupBy(of('system.memory.usage'), r => str(r.attrs.state) || 'total');
  const used = latest(usage.get('used') ?? []);
  const memoryTotal = [...usage.values()].reduce((n, list) => n + (latest(list) ?? 0), 0) || null;
  const utilization = latest(of('system.memory.utilization').filter(r => str(r.attrs.state) === 'used'));

  const fsUsage = of('system.filesystem.usage');
  const fsUtil = of('system.filesystem.utilization');
  const mountpoints = new Set([...fsUsage, ...fsUtil].map(r => str(r.attrs.mountpoint)).filter(Boolean));
  const disks = [...mountpoints].sort().map(mountpoint => {
    const at = (list: InfraRow[], state?: string) =>
      latest(list.filter(r => str(r.attrs.mountpoint) === mountpoint && (!state || str(r.attrs.state) === state)));
    const usedBytes = at(fsUsage, 'used');
    const freeBytes = at(fsUsage, 'free');
    const util = at(fsUtil);
    return {
      mountpoint,
      usedBytes,
      freeBytes,
      usedPercent:
        percent(util) ?? (usedBytes !== null && freeBytes !== null && usedBytes + freeBytes > 0
          ? (usedBytes / (usedBytes + freeBytes)) * 100
          : null),
    };
  });

  const network = of('system.network.io');
  return {
    name,
    cpuPercent: hostCpu(rows),
    memoryPercent: percent(utilization) ?? (used !== null && memoryTotal ? (used / memoryTotal) * 100 : null),
    memoryUsedBytes: used,
    memoryTotalBytes: memoryTotal,
    load1: latest(of('system.cpu.load_average.1m')),
    load5: latest(of('system.cpu.load_average.5m')),
    load15: latest(of('system.cpu.load_average.15m')),
    networkRxBytes: total(network.filter(r => str(r.attrs.direction) === 'receive')),
    networkTxBytes: total(network.filter(r => str(r.attrs.direction) === 'transmit')),
    disks,
    lastSeen: Math.max(...rows.map(r => r.lastAt)),
  };
}

/** Containers and hosts from rows of container.* and system.* metrics. */
export function summarizeInfrastructure(rows: InfraRow[]) {
  const containers = [...groupBy(rows.filter(r => r.metric.startsWith('container.')), r => str(r.attrs['container.name']))]
    .map(([name, list]) => container(name, list))
    .sort((a, b) => a.name.localeCompare(b.name));
  const hosts = [...groupBy(rows.filter(r => r.metric.startsWith('system.')), r => str(r.attrs['host.name']) || 'host')]
    .map(([name, list]) => host(name, list))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { containers, hosts };
}
