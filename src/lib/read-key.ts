/*
 * Website read keys: a `gwa_` API key limited to reading one website's aggregate analytics.
 *
 * An ordinary API key acts as its owner everywhere. A read key carries this scope in its
 * metadata, and checkApiKeyAuth refuses any request outside it: another website, anything that
 * isn't a GET, raw data (sessions, replays, exports, events) and every other route, including
 * the MCP endpoint. It suits a dashboard elsewhere that only needs to chart the numbers.
 */

export const READ_KEY_KIND = 'website-read';

export interface ReadKeyScope {
  kind: typeof READ_KEY_KIND;
  websiteId: string;
}

/**
 * The aggregate endpoints under /api/websites/:id that a read key may call. Counts and
 * breakdowns only; nothing that returns individual sessions, events, replays or exports.
 */
export const READ_KEY_ROUTES = [
  'stats',
  'pageviews',
  'metrics',
  'active',
  'daterange',
  'breakdown',
  'performance',
] as const;

const READ_METHODS = new Set(['GET', 'HEAD']);

/** The scope stored on a key, or null for an ordinary key. Metadata may arrive as JSON text. */
export function parseReadKeyScope(metadata: unknown): ReadKeyScope | null {
  let value = metadata;

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== 'object') return null;

  const { kind, websiteId } = value as Record<string, unknown>;

  if (kind !== READ_KEY_KIND) return null;

  // A read key whose scope is damaged must not fall back to acting as a full key.
  if (typeof websiteId !== 'string' || !websiteId) {
    return { kind: READ_KEY_KIND, websiteId: '' };
  }

  return { kind: READ_KEY_KIND, websiteId };
}

/** Whether a request fits the key's scope: a read of an allowed endpoint of its own website. */
export function readKeyAllows(scope: ReadKeyScope, method: string, pathname: string) {
  if (!scope.websiteId || !READ_METHODS.has(method.toUpperCase())) return false;

  const prefix = `/api/websites/${scope.websiteId}/`;
  if (!pathname.startsWith(prefix)) return false;

  const route = pathname.slice(prefix.length).split('/')[0];

  return (READ_KEY_ROUTES as readonly string[]).includes(route);
}
