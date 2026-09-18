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
