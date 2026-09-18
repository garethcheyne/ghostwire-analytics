import { captureException } from './index';

/**
 * Next.js (15+) instrumentation hook. Reports errors from server components, route handlers,
 * server actions and middleware; Next still handles them exactly as it would have.
 *
 * @example
 * // instrumentation.ts
 * export { onRequestError } from '@ghostwire/node/next';
 *
 * Configure with GHOSTWIRE_HOST, GHOSTWIRE_WEBSITE_ID and GHOSTWIRE_ERROR_KEY, or call init()
 * from register().
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
    renderSource?: string;
    revalidateReason?: string;
  },
) {
  await captureException(error, {
    handled: false,
    request,
    tags: {
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      ...(context.renderSource && { renderSource: context.renderSource }),
    },
  });
}

interface Rewrite {
  source: string;
  destination: string;
  [key: string]: unknown;
}

type Rewrites =
  Rewrite[] | { beforeFiles?: Rewrite[]; afterFiles?: Rewrite[]; fallback?: Rewrite[] };

export interface GhostwireProxyOptions {
  /** Your Ghostwire Analytics server, e.g. https://analytics.example.com */
  host: string;
  /** Path on your site that proxies to Ghostwire. Default "/_gw". */
  path?: string;
  /** Tracker script name, if your server renames it. Default "script.js". */
  scriptName?: string;
}

/** The rewrites that serve the tracker from your own domain (only what tracking needs). */
export function ghostwireRewrites({
  host,
  path = '/_gw',
  scriptName = 'script.js',
}: GhostwireProxyOptions): Rewrite[] {
  const base = host.replace(/\/+$/, '');
  const prefix = `/${path.replace(/^\/+|\/+$/g, '')}`;
  const script = scriptName.replace(/^\/+/, '');

  return [
    { source: `${prefix}/${script}`, destination: `${base}/${script}` },
    { source: `${prefix}/recorder.js`, destination: `${base}/recorder.js` },
    { source: `${prefix}/api/send`, destination: `${base}/api/send` },
    { source: `${prefix}/api/record`, destination: `${base}/api/record` },
    {
      source: `${prefix}/api/websites/:websiteId/recorder`,
      destination: `${base}/api/websites/:websiteId/recorder`,
    },
  ];
}

/**
 * Serves Ghostwire from your own domain (first-party), so ad blockers that block analytics
 * hosts don't drop your page views or error reports. Wrap your Next config, then point the
 * tracker at the path: `<GhostwireProvider host="/_gw" ... />` or
 * `<script defer src="/_gw/script.js" data-website-id="..."></script>`.
 *
 * Only the tracker, recorder and ingest endpoints are proxied, never the Ghostwire app itself.
 * Visitor locations come from the X-Forwarded-For header your hosting (or reverse proxy) adds.
 *
 * @example
 * // next.config.ts
 * import { withGhostwire } from '@ghostwire/node/next';
 * export default withGhostwire(nextConfig, { host: 'https://analytics.example.com' });
 */
export function withGhostwire<
  T extends { rewrites?: () => Rewrites | Promise<Rewrites> } & Record<string, any>,
>(nextConfig: T, options: GhostwireProxyOptions): T & { rewrites: () => Promise<Rewrites> } {
  const ours = ghostwireRewrites(options);

  return {
    ...nextConfig,
    async rewrites(): Promise<Rewrites> {
      const existing = await nextConfig.rewrites?.();

      if (!existing) return ours;
      if (Array.isArray(existing)) return [...ours, ...existing];

      return { ...existing, beforeFiles: [...ours, ...(existing.beforeFiles ?? [])] };
    },
  };
}
