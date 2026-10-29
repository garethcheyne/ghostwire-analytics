import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = {
  appSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  $executeRawUnsafe: vi.fn(),
};

vi.mock('@/lib/prisma', () => ({ default: { client } }));

const { rollupHours, rollupWindow, runMonitoringRetention } = await import('./schedule');

const HOUR = 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 29, 12, 34, 56);

beforeEach(() => {
  vi.clearAllMocks();
  client.$executeRawUnsafe.mockResolvedValue(0);
});

describe('hourly rollups', () => {
  it('recomputes the previous and current hour on a normal run', () => {
    const window = rollupWindow(now, Date.UTC(2026, 9, 29, 12));
    expect(window.from.toISOString()).toBe('2026-10-29T11:00:00.000Z');
    expect(window.to.getTime()).toBe(now);
    expect(window.watermark.toISOString()).toBe('2026-10-29T12:00:00.000Z');
  });

  it('catches up after downtime, but at most a week', () => {
    expect(rollupWindow(now, Date.UTC(2026, 9, 29, 7)).from.toISOString()).toBe('2026-10-29T07:00:00.000Z');
    expect(rollupWindow(now, Date.UTC(2026, 8, 1)).from.getTime()).toBe(Math.floor((now - 7 * 24 * HOUR) / HOUR) * HOUR);
    expect(rollupWindow(now, null).from.toISOString()).toBe('2026-10-29T11:00:00.000Z');
  });

  it('upserts hours from minutes and moves the watermark', async () => {
    client.appSetting.findUnique.mockResolvedValue({ value: '2026-10-29T12:00:00.000Z' });
    client.$executeRawUnsafe.mockResolvedValue(3);

    expect(await rollupHours(now)).toBe(3);
    const [sql, from, to] = client.$executeRawUnsafe.mock.calls[0];
    expect(sql).toContain('insert into monitor_metric_hour');
    expect(sql).toContain('monitor_sum_buckets(buckets');
    expect(sql).toContain('on conflict');
    expect(from).toEqual(new Date('2026-10-29T11:00:00.000Z'));
    expect(to).toEqual(new Date(now));
    expect(client.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: '2026-10-29T12:00:00.000Z' } }),
    );
  });
});

describe('retention', () => {
  it("deletes each table past the website's own retention, in batches", async () => {
    // Spans: a full batch, then a short one, so it loops once more.
    client.$executeRawUnsafe.mockResolvedValueOnce(5000).mockResolvedValueOnce(12);

    const removed = await runMonitoringRetention();

    expect(removed.spans).toBe(5012);
    const statements = client.$executeRawUnsafe.mock.calls.map(([sql]) => String(sql));
    expect(statements[0]).toContain('make_interval(days => w.monitor_span_days)');
    expect(statements.some(s => s.includes('w.monitor_minute_days'))).toBe(true);
    expect(statements.some(s => s.includes('w.monitor_hour_days') && s.includes('monitor_metric_hour'))).toBe(true);
    expect(statements.some(s => s.includes('monitor_cumulative'))).toBe(true);
    expect(statements.some(s => s.includes('delete from monitor_service'))).toBe(true);
    expect(client.$executeRawUnsafe.mock.calls[0][1]).toBe(5000);
  });
});
