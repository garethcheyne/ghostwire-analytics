import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// db.ts imports none of these directly, but the mocks keep the test isolated
// from real database clients if that ever changes.
vi.mock('@/lib/prisma', () => ({}));

let db!: typeof import('./db');

beforeEach(async () => {
  vi.resetModules();
  db = await import('./db');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getDatabaseType', () => {
  test('maps a postgres:// url to postgresql', () => {
    expect(db.getDatabaseType('postgres://user:pass@localhost:5432/umami')).toBe('postgresql');
  });

  test('returns postgresql for a postgresql:// url', () => {
    expect(db.getDatabaseType('postgresql://user:pass@localhost:5432/umami')).toBe('postgresql');
  });

  test('returns the raw scheme for other databases', () => {
    expect(db.getDatabaseType('mysql://user:pass@localhost:3306/umami')).toBe('mysql');
  });

  test('reads process.env.DATABASE_URL by default', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/umami');
    expect(db.getDatabaseType()).toBe('postgresql');
  });

  test('falls back to the DATABASE_URL default when called with undefined', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@localhost:5432/umami');
    expect(db.getDatabaseType(undefined)).toBe('postgresql');
  });
});

describe('runQuery', () => {
  test('runs the prisma query for a postgresql database', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/umami');
    const prisma = vi.fn().mockResolvedValue('prisma-result');

    await expect(db.runQuery({ prisma })).resolves.toBe('prisma-result');
    expect(prisma).toHaveBeenCalledTimes(1);
  });
});

describe('isRelationalOnly', () => {
  test('is always true: Ghostwire Analytics only runs on PostgreSQL', () => {
    expect(db.isRelationalOnly()).toBe(true);
  });
});

describe('BigInt.prototype.toJSON', () => {
  test('serializes bigint values as numbers', () => {
    expect((BigInt(123) as any).toJSON()).toBe(123);
    expect(JSON.stringify({ count: BigInt(42) })).toBe('{"count":42}');
  });
});

describe('notImplemented', () => {
  test('throws a Not implemented error', () => {
    expect(() => db.notImplemented()).toThrow('Not implemented.');
  });
});
