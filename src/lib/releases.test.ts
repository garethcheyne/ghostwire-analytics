import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeRaw = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: { client: { $executeRaw: executeRaw, release: { findUnique: vi.fn() } } },
}));

const { normalizeRelease, recordRelease, resetReleaseCache } = await import('./releases');

beforeEach(() => {
  executeRaw.mockReset();
  executeRaw.mockResolvedValue(1);
  resetReleaseCache();
});

describe('releases', () => {
  it('normalizes versions', () => {
    expect(normalizeRelease(' 2.4.1 ')).toBe('2.4.1');
    expect(normalizeRelease('')).toBeNull();
    expect(normalizeRelease(42)).toBeNull();
    expect(normalizeRelease('x'.repeat(150))).toHaveLength(100);
  });

  it('records a release at most every 10 minutes per website', async () => {
    const at = new Date('2026-09-19T12:00:00Z');

    await recordRelease('w1', '2.4.1', at);
    await recordRelease('w1', '2.4.1', new Date(at.getTime() + 60_000));
    await recordRelease('w2', '2.4.1', at);
    await recordRelease('w1', '2.4.1', new Date(at.getTime() + 11 * 60_000));
    await recordRelease('w1', null, at);

    expect(executeRaw).toHaveBeenCalledTimes(3);
  });

  it('retries after a failed write instead of waiting out the throttle', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    executeRaw.mockRejectedValueOnce(new Error('db down'));
    const at = new Date('2026-09-19T12:00:00Z');

    await recordRelease('w1', '2.4.1', at);
    await recordRelease('w1', '2.4.1', at);

    expect(executeRaw).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
