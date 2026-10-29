import { describe, expect, it } from 'vitest';
import { mergeBy, mergeHistograms } from './histograms';
import { type InfraRow, summarizeInfrastructure } from './infrastructure';
import { bucketSql, resolutionFor, rollupTable } from './resolution';
import { downAfterSeconds, serviceStatus } from './status';

const now = Date.UTC(2026, 9, 29, 12);
const ago = (seconds: number) => new Date(now - seconds * 1000);

describe('service status', () => {
  it('is down after three missed intervals, at least two minutes', () => {
    expect(downAfterSeconds(30)).toBe(120);
    expect(downAfterSeconds(60)).toBe(210);
    expect(downAfterSeconds(null)).toBe(210);
    expect(downAfterSeconds(100_000)).toBe(2730); // interval capped at 15 minutes
  });

  it('follows metrics, then heartbeats', () => {
    const base = { lastSeen: ago(5), lastMetricsAt: ago(5), lastHeartbeatAt: null, intervalSeconds: 30 };
    expect(serviceStatus(base, now).status).toBe('up');
    expect(serviceStatus({ ...base, lastMetricsAt: ago(300) }, now)).toMatchObject({
      status: 'down',
      reason: 'Stopped reporting',
    });
    // Still exporting, but the worker loop stopped beating.
    expect(serviceStatus({ ...base, lastHeartbeatAt: ago(600) }, now)).toMatchObject({
      status: 'down',
      reason: 'Heartbeat stopped',
    });
  });

  it('calls trace-only services idle, never down', () => {
    const traces = { lastSeen: ago(60), lastMetricsAt: null, lastHeartbeatAt: null, intervalSeconds: null };
    expect(serviceStatus(traces, now).status).toBe('up');
    expect(serviceStatus({ ...traces, lastSeen: ago(3600) }, now).status).toBe('idle');
  });
});

describe('resolution', () => {
  const h = 3_600_000;
  it('reads minutes for short ranges and hours for long ones', () => {
    expect(resolutionFor(0, h)).toEqual({ table: 'monitor_metric_minute', bucketSeconds: 60 });
    expect(resolutionFor(0, 24 * h)).toEqual({ table: 'monitor_metric_minute', bucketSeconds: 300 });
    expect(resolutionFor(0, 7 * 24 * h)).toEqual({ table: 'monitor_metric_hour', bucketSeconds: 3600 });
    expect(resolutionFor(0, 90 * 24 * h)).toEqual({ table: 'monitor_metric_hour', bucketSeconds: 86400 });
  });

  it('only lets known tables and integer buckets into SQL', () => {
    expect(() => rollupTable('website; drop table x')).toThrow();
    expect(() => bucketSql('bucket', 1.5)).toThrow();
    expect(() => bucketSql('bucket); --', 60)).toThrow();
    expect(bucketSql('bucket', 300)).toContain('/ 300) * 300');
  });
});

describe('histogram rows', () => {
  it('merges rows from the database (bigints and strings) into stats', () => {
    const stats = mergeHistograms([
      { bounds: [10, 100], buckets: [5n, 5n, 0n], count: 10n, sum: '300', min: 2, max: 90, errors: 1n },
      { bounds: [50], buckets: ['0', '10'], count: '10', sum: 1000, min: 60, max: 200, errors: null },
    ]);
    expect(stats).toMatchObject({ count: 20, errors: 1, sum: 1300, avg: 65, min: 2, max: 200 });
    expect(stats.p50).toBeGreaterThan(10);
    expect(stats.p99).toBeLessThanOrEqual(200);
  });

  it('groups by key', () => {
    const rows = [
      { k: 'a', bounds: [1], buckets: [1, 0], count: 1, sum: 1, min: 1, max: 1 },
      { k: 'a', bounds: [2], buckets: [1, 0], count: 1, sum: 2, min: 2, max: 2 },
      { k: 'b', bounds: [1], buckets: [0, 1], count: 1, sum: 5, min: 5, max: 5 },
    ];
    const groups = mergeBy(rows, r => r.k);
    expect(groups.map(g => [g.key, g.stats.count])).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
  });
});

const row = (metric: string, attrs: Record<string, unknown>, fields: Partial<InfraRow>): InfraRow => ({
  metric,
  attrs,
  sum: 0,
  count: 1,
  max: null,
  last: null,
  minutes: 1,
  lastAt: now,
  ...fields,
});

describe('infrastructure', () => {
  it('works out container CPU from CPU time, memory from usage and limit', () => {
    const api = { 'container.name': 'api' };
    const { containers } = summarizeInfrastructure([
      // 30 s of CPU time over 10 minutes: 5 % of one core.
      row('container.cpu.usage.total', api, { sum: 30e9, count: 20, minutes: 10 }),
      row('container.memory.usage.total', api, { last: 256e6, sum: 2560e6, count: 10 }),
      row('container.memory.usage.limit', api, { last: 1024e6 }),
      row('container.network.io.usage.rx_bytes', api, { sum: 1000 }),
      row('container.network.io.usage.tx_bytes', api, { sum: 500 }),
      row('container.restarts', api, { sum: 2 }),
      row('container.uptime', api, { last: 42 }),
    ]);
    expect(containers).toHaveLength(1);
    expect(containers[0]).toMatchObject({
      name: 'api',
      memoryBytes: 256e6,
      memoryPercent: 25,
      networkRxBytes: 1000,
      networkTxBytes: 500,
      restarts: 2,
      uptimeSeconds: 42,
    });
    expect(containers[0].cpuPercent).toBeCloseTo(5);
  });

  it('uses the utilization gauges for hosts, and for containers without CPU time', () => {
    const { containers, hosts } = summarizeInfrastructure([
      row('container.cpu.utilization', { 'container.name': 'db' }, { sum: 0.3, count: 2 }),
      row('system.cpu.utilization', { 'host.name': 'box', state: 'idle' }, { sum: 1.5, count: 2 }),
      row('system.cpu.utilization', { 'host.name': 'box', state: 'user' }, { sum: 0.5, count: 2 }),
      row('system.memory.utilization', { 'host.name': 'box', state: 'used' }, { last: 0.42 }),
      row('system.filesystem.utilization', { 'host.name': 'box', mountpoint: '/' }, { last: 0.7 }),
      row('system.cpu.load_average.1m', { 'host.name': 'box' }, { last: 1.25 }),
    ]);
    expect(containers[0].cpuPercent).toBe(15);
    expect(hosts[0]).toMatchObject({ name: 'box', memoryPercent: 42, load1: 1.25 });
    expect(hosts[0].cpuPercent).toBeCloseTo(25);
    expect(hosts[0].disks).toEqual([{ mountpoint: '/', usedBytes: null, freeBytes: null, usedPercent: 70 }]);
  });

  it('falls back to CPU time and memory usage by state for hosts', () => {
    const host = { 'host.name': 'box' };
    const { hosts } = summarizeInfrastructure([
      row('system.cpu.time', { ...host, state: 'idle' }, { sum: 75 }),
      row('system.cpu.time', { ...host, state: 'user' }, { sum: 25 }),
      row('system.memory.usage', { ...host, state: 'used' }, { last: 3 }),
      row('system.memory.usage', { ...host, state: 'free' }, { last: 1 }),
      row('system.network.io', { ...host, direction: 'receive' }, { sum: 10 }),
    ]);
    expect(hosts[0]).toMatchObject({ cpuPercent: 25, memoryPercent: 75, memoryTotalBytes: 4, networkRxBytes: 10 });
  });
});
