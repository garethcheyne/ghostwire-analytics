import { describe, expect, it } from 'vitest';
import { createErrorKey, verifyErrorKey } from './error-key';

describe('error ingest keys', () => {
  it('verifies a key against its stored hash only', () => {
    const { key, hash, hint } = createErrorKey();

    expect(key).toMatch(/^gwe_[\w-]{32}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key);
    expect(key.endsWith(hint)).toBe(true);

    expect(verifyErrorKey(key, hash)).toBe(true);
    expect(verifyErrorKey(`${key}x`, hash)).toBe(false);
    expect(verifyErrorKey(createErrorKey().key, hash)).toBe(false);
  });

  it('rejects missing keys, missing hashes and other key types', () => {
    const { key, hash } = createErrorKey();

    expect(verifyErrorKey(undefined, hash)).toBe(false);
    expect(verifyErrorKey(key, null)).toBe(false);
    expect(verifyErrorKey(`gwa_${key.slice(4)}`, hash)).toBe(false);
  });
});
