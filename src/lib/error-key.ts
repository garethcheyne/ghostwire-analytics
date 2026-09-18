import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Prefix for per-website error ingest keys (server clients send them as a Bearer token). */
export const ERROR_KEY_PREFIX = 'gwe_';

export function hashErrorKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

/** A new random key. Only its hash and last few characters (the hint) are stored. */
export function createErrorKey() {
  const key = `${ERROR_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;

  return { key, hash: hashErrorKey(key), hint: key.slice(-4) };
}

export function verifyErrorKey(key: string | null | undefined, hash: string | null | undefined) {
  if (!key || !hash || !key.startsWith(ERROR_KEY_PREFIX)) return false;

  const expected = Buffer.from(hash, 'hex');
  const actual = Buffer.from(hashErrorKey(key), 'hex');

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
