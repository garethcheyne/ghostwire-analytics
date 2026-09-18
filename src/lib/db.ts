export const PRISMA = 'prisma';
export const POSTGRESQL = 'postgresql';

// Fixes issue with converting bigint values
(BigInt.prototype as unknown as { toJSON(): number }).toJSON = function () {
  return Number(this);
};

export function getDatabaseType(url = process.env.DATABASE_URL) {
  const type = url?.split(':')[0];

  if (type === 'postgres') {
    return POSTGRESQL;
  }

  return type;
}

/** Always true: Ghostwire Analytics only runs on PostgreSQL (no ClickHouse). */
export function isRelationalOnly() {
  return true;
}

/**
 * Runs the PostgreSQL implementation of a query. Umami used this to switch between
 * PostgreSQL and ClickHouse; the ClickHouse variants have been removed.
 */
export async function runQuery(queries: { [PRISMA]: () => any }) {
  return queries[PRISMA]();
}

export function notImplemented() {
  throw new Error('Not implemented.');
}
