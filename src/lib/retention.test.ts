import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeRaw = vi.fn();

vi.mock('@/lib/prisma', () => ({ default: { client: { $executeRaw: executeRaw } } }));

const { getRetentionDays, runRetention } = await import('./retention');

const sql = (call: unknown[]) => (call[0] as TemplateStringsArray).join('?');

beforeEach(() => {
  executeRaw.mockReset();
  executeRaw.mockResolvedValue(0);
});

describe('getRetentionDays', () => {
  it('keeps everything unless configured', () => {
    expect(getRetentionDays({})).toEqual({ replays: 0, heatmaps: 0, errors: 0 });
  });

  it('uses DATA_RETENTION_DAYS as the default and per-kind overrides', () => {
    expect(
      getRetentionDays({
        DATA_RETENTION_DAYS: '90',
        HEATMAP_RETENTION_DAYS: '30',
        ERROR_RETENTION_DAYS: '0',
      }),
    ).toEqual({ replays: 90, heatmaps: 30, errors: 0 });
  });

  it('treats invalid values as keep forever', () => {
    expect(getRetentionDays({ DATA_RETENTION_DAYS: 'soon' }).replays).toBe(0);
    expect(getRetentionDays({ DATA_RETENTION_DAYS: '-5' }).replays).toBe(0);
  });
});

describe('runRetention', () => {
  it('deletes nothing when switched off', async () => {
    await runRetention({ replays: 0, heatmaps: 0, errors: 0 });
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it('deletes only what is older than the cutoff, keeping saved replays', async () => {
    const now = new Date('2026-09-19T00:00:00Z');
    await runRetention({ replays: 90, heatmaps: 0, errors: 0 }, now);

    expect(executeRaw).toHaveBeenCalledTimes(1);
    const [call] = executeRaw.mock.calls;
    expect(sql(call)).toContain('session_replay_saved');
    expect(call[1]).toEqual(new Date('2026-06-21T00:00:00Z'));
  });

  it('repeats batches until a short batch, and keeps ignored error groups', async () => {
    executeRaw.mockResolvedValueOnce(5000).mockResolvedValueOnce(12).mockResolvedValue(3);

    const result = await runRetention({ replays: 0, heatmaps: 0, errors: 30 });

    expect(result).toEqual({ replays: 0, heatmaps: 0, errorEvents: 5012, errorGroups: 3 });
    expect(sql(executeRaw.mock.calls[2])).toContain("status <> 'ignored'");
  });
});
