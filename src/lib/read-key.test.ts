import { describe, expect, test } from 'vitest';
import { READ_KEY_KIND, parseReadKeyScope, readKeyAllows } from './read-key';

const site = '0b8a3c6e-4f4e-4c55-9f7c-2a1f6e0c9d11';
const other = '9d2f1e3a-6b7c-4d8e-9f00-112233445566';
const scope = { kind: READ_KEY_KIND, websiteId: site } as const;

describe('parseReadKeyScope', () => {
  test('reads a scope stored as an object or as JSON text', () => {
    expect(parseReadKeyScope({ kind: 'website-read', websiteId: site })).toEqual(scope);
    expect(parseReadKeyScope(JSON.stringify({ kind: 'website-read', websiteId: site }))).toEqual(scope);
  });

  test('treats keys without a read scope as ordinary keys', () => {
    expect(parseReadKeyScope(null)).toBeNull();
    expect(parseReadKeyScope(undefined)).toBeNull();
    expect(parseReadKeyScope({ purpose: 'something else' })).toBeNull();
    expect(parseReadKeyScope('not json')).toBeNull();
  });

  test('keeps a damaged read scope locked down instead of falling back to a full key', () => {
    const damaged = parseReadKeyScope({ kind: 'website-read' });
    expect(damaged).toEqual({ kind: 'website-read', websiteId: '' });
    expect(readKeyAllows(damaged!, 'GET', `/api/websites/${site}/stats`)).toBe(false);
  });
});

describe('readKeyAllows', () => {
  test('allows reading aggregate analytics for its own website', () => {
    for (const path of ['stats', 'pageviews', 'metrics', 'metrics/expanded', 'active', 'daterange', 'breakdown', 'performance/chart']) {
      expect(readKeyAllows(scope, 'GET', `/api/websites/${site}/${path}`), path).toBe(true);
    }
  });

  test('refuses other websites', () => {
    expect(readKeyAllows(scope, 'GET', `/api/websites/${other}/stats`)).toBe(false);
    expect(readKeyAllows(scope, 'GET', `/api/websites/${site}x/stats`)).toBe(false);
  });

  test('refuses anything that is not a read', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(readKeyAllows(scope, method, `/api/websites/${site}/stats`), method).toBe(false);
    }
  });

  test('refuses raw data, settings and every other route', () => {
    for (const path of [
      `/api/websites/${site}`,
      `/api/websites/${site}/sessions`,
      `/api/websites/${site}/replays`,
      `/api/websites/${site}/export`,
      `/api/websites/${site}/events`,
      `/api/websites/${site}/reset`,
      `/api/websites/${site}/transfer`,
      '/api/websites',
      '/api/mcp',
      '/api/me',
      '/api/teams',
    ]) {
      expect(readKeyAllows(scope, 'GET', path), path).toBe(false);
    }
  });
});
