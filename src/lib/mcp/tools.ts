/*
 * The tools the MCP endpoint exposes.
 *
 * Two jobs, matching what an agent is actually asked to do: set a site up so
 * it starts reporting (including the keys another app needs to report errors
 * or read its numbers), and answer "how is it doing?" — for visitors, and for
 * the systems reporting to it (system monitoring, read-only). Everything else —
 * teams, users, alerts, deletion — is deliberately absent, so a bad prompt
 * cannot do lasting damage through this door.
 *
 * Every tool runs against the caller's own permissions: `auth` comes from the
 * same checkAuth the REST API uses, and each handler asks the same question
 * the equivalent route would.
 */
import { z } from 'zod';
import type { Auth } from '@/lib/types';
import { createErrorKey } from '@/lib/error-key';
import { READ_KEY_KIND, READ_KEY_ROUTES } from '@/lib/read-key';
import { DOMAIN_REGEX } from '@/lib/constants';
import {
  canCreateWebsite,
  canUpdateWebsite,
  canViewAuthenticatedWebsite,
  canViewWebsite,
} from '@/permissions';
import { createWebsite, getUserWebsites, getWebsite, updateWebsite } from '@/queries/prisma';
import {
  getActiveVisitors,
  getChannelMetrics,
  getPageviewMetrics,
  getPageviewStats,
  getSessionMetrics,
  getSessionStats,
  getWebsiteStats,
} from '@/queries/sql';
import { getEndpoints, getSystemServices, getTraces } from '@/queries/sql/system';
import { log } from '@/lib/logger';
import type { McpTool, ToolResult } from './protocol';


const text = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>,
});

/** A failure whose message is meant for the caller (anything else is logged and kept private). */
class ToolError extends Error {}

const refuse = (message: string): ToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

/**
 * The tags a site pastes in, built the same way the settings screen builds them.
 *
 * The origin comes from the request the agent made rather than from APP_URL,
 * so the snippet always names the host the agent can actually reach. An
 * instance behind a proxy with APP_URL unset would otherwise hand back a
 * snippet pointing somewhere the browser cannot resolve, and nothing about it
 * would look wrong.
 */
function trackingSnippet(
  websiteId: string,
  origin: string,
  { errors, replays }: { errors: boolean; replays: boolean },
) {
  const tags = [
    `<script defer src="${origin}/script.js" data-website-id="${websiteId}"${errors ? ' data-errors="true"' : ''} data-performance="true"></script>`,
  ];

  if (replays) {
    tags.push(
      `<script defer src="${origin}/recorder.js" data-website-id="${websiteId}" data-host-url="${origin}"></script>`,
    );
  }

  return tags.join('\n');
}

const websiteSummary = (website: any) => ({
  id: website.id,
  name: website.name,
  domain: website.domain,
  errorsEnabled: !!website.errorsEnabled,
  recorderEnabled: !!website.recorderEnabled,
  createdAt: website.createdAt,
});

/** Dates arrive as ISO strings; the queries want Date objects and a sane default. */
const dateRange = z.object({
  startDate: z
    .string()
    .describe('Start of the period, ISO 8601 (e.g. "2026-09-01"). Defaults to 30 days ago.')
    .optional(),
  endDate: z
    .string()
    .describe('End of the period, ISO 8601. Defaults to now.')
    .optional(),
});

function resolveRange({ startDate, endDate }: { startDate?: string; endDate?: string }) {
  const end = endDate ? new Date(endDate) : new Date();
  const start = startDate
    ? new Date(startDate)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ToolError('startDate and endDate must be ISO 8601 dates, e.g. "2026-09-01".');
  }

  if (start > end) {
    throw new ToolError('startDate is after endDate.');
  }

  return { startDate: start, endDate: end };
}

/** Monitoring tools look at the recent past by default: the last hour. */
function resolveRecentRange(range: { startDate?: string; endDate?: string }) {
  const end = range.endDate ? new Date(range.endDate) : new Date();
  return resolveRange({
    startDate: range.startDate ?? new Date(end.getTime() - 60 * 60 * 1000).toISOString(),
    endDate: range.endDate,
  });
}

const recentRange = z.object({
  startDate: z.string().describe('Start of the period, ISO 8601. Defaults to an hour ago.').optional(),
  endDate: z.string().describe('End of the period, ISO 8601. Defaults to now.').optional(),
});

/**
 * Monitoring data (span attributes, statements, routes) is for signed-in users and full API keys,
 * like the REST routes: the same gate as canViewAuthenticatedWebsite.
 */
async function monitorable(auth: Auth, websiteId: string) {
  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    throw new ToolError(`No website ${websiteId}, or you do not have access to it.`);
  }
}

const round = (value: number | null) => (value === null ? null : Math.round(value * 100) / 100);

/** Every tool that names a website checks the caller may see it before anything else. */
async function readable(auth: Auth, websiteId: string) {
  if (!(await canViewWebsite(auth, websiteId))) {
    throw new ToolError(`No website ${websiteId}, or you do not have access to it.`);
  }

  const website = await getWebsite(websiteId);
  if (!website) throw new ToolError(`No website ${websiteId}.`);

  return website;
}

type ToolDefinition = Omit<McpTool, 'inputSchema'> & { input: z.ZodRawShape };

/**
 * Publishes a tool's arguments as JSON Schema and enforces the same Zod schema on every call:
 * the handlers rely on it (several values end up in SQL text), and the schema a client is shown
 * is no guarantee of what it sends.
 */
function finish({ input, handler, ...tool }: ToolDefinition): McpTool {
  const args = z.object(input);

  return {
    ...tool,
    inputSchema: z.toJSONSchema(args) as Record<string, unknown>,
    handler: async raw => {
      const parsed = args.safeParse(raw ?? {});

      if (!parsed.success) {
        return refuse(`Invalid arguments for ${tool.name}: ${z.prettifyError(parsed.error)}`);
      }

      try {
        return await handler(parsed.data);
      } catch (error) {
        if (error instanceof ToolError) return refuse(error.message);

        log.error('mcp.tool_failed', { tool: tool.name, error });
        return refuse(`${tool.name} failed. The details are in the server log.`);
      }
    },
  };
}

export function buildTools(auth: Auth, origin: string): McpTool[] {
  const tools: ToolDefinition[] = [
    {
      name: 'ghostwire_list_websites',
      title: 'List websites',
      description:
        'List the websites this API key can see, with their IDs and whether error reporting and session replay are switched on.',
      input: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async () => {
        if (!auth.user) return refuse('This tool needs an API key belonging to a user.');

        const websites = await getUserWebsites(auth.user.id, { pageSize: 100 } as any);
        const rows = (websites as any)?.data ?? websites ?? [];

        return text({ websites: rows.map(websiteSummary), count: rows.length });
      },
    },

    {
      name: 'ghostwire_create_website',
      title: 'Create a website',
      description:
        'Create a website to track and return its ID along with the tracker snippet to paste into the site. Use this once per site; call ghostwire_list_websites first to check it does not already exist.',
      input: {
        name: z.string().trim().min(1).max(100).describe('What to call it in Ghostwire.'),
        domain: z
          .string()
          .trim()
          .max(500)
          .describe('The hostname it runs on, without a scheme (e.g. "example.com").'),
        enableErrors: z
          .boolean()
          .describe('Accept browser and server error reports for this site. Default false.')
          .optional(),
        enableReplays: z
          .boolean()
          .describe('Record session replays and heatmaps. Default false.')
          .optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      handler: async ({ name, domain, enableErrors = false, enableReplays = false }) => {
        if (!auth.user) return refuse('This tool needs an API key belonging to a user.');
        if (!(await canCreateWebsite(auth))) return refuse('You may not create websites.');

        if (!DOMAIN_REGEX.test(domain)) {
          return refuse(
            `"${domain}" is not a valid hostname. Give the bare host, with no scheme or path — for example "example.com".`,
          );
        }

        const website = await createWebsite({
          id: crypto.randomUUID(),
          name,
          domain,
          userId: auth.user.id,
          createdBy: auth.user.id,
          errorsEnabled: enableErrors,
          recorderEnabled: enableReplays,
        });

        return text({
          ...websiteSummary(website),
          trackingSnippet: trackingSnippet(website.id, origin, {
            errors: enableErrors,
            replays: enableReplays,
          }),
          next: [
            'Put the snippet in the <head> of every page, via the shared layout or template.',
            'If the app sets a Content-Security-Policy, add ' +
              origin +
              ' to BOTH script-src and connect-src. Missing connect-src loads the tracker and blocks every page view.',
            'If the host or website ID is read at build time (a prerendered route, or NEXT_PUBLIC_/VITE_ inlining), it must be set at build, not only at runtime.',
            ...(enableErrors
              ? [
                  'For errors thrown on the server, call ghostwire_create_error_key to issue the gwe_ ingest key.',
                ]
              : []),
            'Then check it works: the tag is in the served HTML, a POST to /api/send returns 200, and the visit shows in Realtime.',
            'The ghostwire-analytics skill has the per-framework detail if it is installed.',
          ],
        });
      },
    },

    {
      name: 'ghostwire_get_website',
      title: 'Get a website',
      description:
        'Fetch one website by ID, with its settings and the tracker snippet for pasting into the site.',
      input: { websiteId: z.uuid().describe('The website ID.') },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ websiteId }) => {
        const website = await readable(auth, websiteId);

        return text({
          ...websiteSummary(website),
          trackingSnippet: trackingSnippet(website.id, origin, {
            errors: !!website.errorsEnabled,
            replays: !!website.recorderEnabled,
          }),
        });
      },
    },

    {
      name: 'ghostwire_update_website',
      title: 'Update a website',
      description:
        'Rename a website, change its domain, or switch error reporting and session replay on or off.',
      input: {
        websiteId: z.uuid().describe('The website ID.'),
        name: z.string().trim().min(1).max(100).optional(),
        domain: z.string().trim().max(500).optional(),
        enableErrors: z.boolean().optional(),
        enableReplays: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
      handler: async ({ websiteId, name, domain, enableErrors, enableReplays }) => {
        if (!(await canUpdateWebsite(auth, websiteId))) {
          return refuse(`You may not change website ${websiteId}.`);
        }

        if (domain !== undefined && !DOMAIN_REGEX.test(domain)) {
          return refuse(`"${domain}" is not a valid hostname.`);
        }

        const website = await updateWebsite(websiteId, {
          ...(name !== undefined && { name }),
          ...(domain !== undefined && { domain }),
          ...(enableErrors !== undefined && { errorsEnabled: enableErrors }),
          ...(enableReplays !== undefined && { recorderEnabled: enableReplays }),
        });

        return text(websiteSummary(website));
      },
    },

    {
      name: 'ghostwire_create_error_key',
      title: 'Issue a server error key',
      description:
        'Issue the ingest key a server uses to report errors from the back end and to send system monitoring (OpenTelemetry to /v1/metrics and /v1/traces): the gwe_ key. The key is shown once and cannot be retrieved later; issuing a new one replaces any existing key, so anything still using the old one stops reporting.',
      input: { websiteId: z.uuid().describe('The website ID.') },
      // Replacing a key silently stops whatever was using the old one.
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
      handler: async ({ websiteId }) => {
        if (!(await canUpdateWebsite(auth, websiteId))) {
          return refuse(`You may not change website ${websiteId}.`);
        }

        const { key, hash, hint } = createErrorKey();

        await updateWebsite(websiteId, {
          errorKeyHash: hash,
          errorKeyHint: hint,
          // A key nobody can report against is not much use; issuing one turns
          // error reporting on so the site starts working immediately.
          errorsEnabled: true,
        });

        return text({
          websiteId,
          errorKey: key,
          note: 'Store this as GHOSTWIRE_ERROR_KEY on the server. It is not shown again.',
        });
      },
    },

    {
      name: 'ghostwire_create_read_key',
      title: 'Issue a read-only key for one site',
      description:
        "Issue a gwa_ API key that can only read one website's aggregate analytics over the REST API: stats, page views, breakdowns (metrics), active visitors, date range and performance. It cannot see other sites, raw sessions, replays or exports, cannot change anything, and cannot use this MCP endpoint. For showing a site's numbers in another app's dashboard. Shown once; revoke it under Settings → API keys.",
      input: {
        websiteId: z.uuid().describe('The website ID.'),
        name: z
          .string()
          .min(1)
          .max(32)
          .describe('What to call the key in Settings → API keys, e.g. "Acme admin dashboard".')
          .optional(),
        expiresInDays: z
          .number()
          .int()
          .min(1)
          .max(365)
          .describe('Expire the key after this many days. Default: never.')
          .optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
      handler: async ({ websiteId, name, expiresInDays }) => {
        if (!auth.user) return refuse('Sign in with an API key to issue keys.');
        // A key must never be able to mint a broader (or another) key.
        if (auth.apiKey?.scope) return refuse('A read-only key cannot issue keys.');
        if (!(await canUpdateWebsite(auth, websiteId))) {
          return refuse(`You may not manage website ${websiteId}.`);
        }

        const website = await getWebsite(websiteId);
        if (!website) return refuse(`No website ${websiteId}.`);

        const { auth: betterAuth } = await import('@/lib/better-auth');
        const created = await betterAuth.api.createApiKey({
          body: {
            userId: auth.user.id,
            name: (name ?? `Read: ${website.name}`).slice(0, 32),
            metadata: { kind: READ_KEY_KIND, websiteId },
            ...(expiresInDays ? { expiresIn: expiresInDays * 24 * 60 * 60 } : {}),
          },
        });

        return text({
          websiteId,
          keyId: created.id,
          name: created.name,
          key: created.key,
          expiresAt: created.expiresAt ?? null,
          allows: READ_KEY_ROUTES.map(route => `GET ${origin}/api/websites/${websiteId}/${route}`),
          note: 'Send it as "Authorization: Bearer <key>". It is shown once and is a secret: store it server-side (for example GHOSTWIRE_API_KEY), never in browser code. Revoke it under Settings → API keys.',
        });
      },
    },

    {
      name: 'ghostwire_get_stats',
      title: 'Get headline stats',
      description:
        'Visitors, page views, visits, bounce rate and average visit time for a period, with the same figures for the preceding period of equal length so changes can be reported.',
      input: { websiteId: z.uuid().describe('The website ID.'), ...dateRange.shape },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ websiteId, startDate, endDate }) => {
        await readable(auth, websiteId);
        const range = resolveRange({ startDate, endDate });

        const span = range.endDate.getTime() - range.startDate.getTime();
        const previous = {
          startDate: new Date(range.startDate.getTime() - span - 1),
          endDate: new Date(range.startDate.getTime() - 1),
        };

        const [current, before] = (await Promise.all([
          getWebsiteStats(websiteId, range as any),
          getWebsiteStats(websiteId, previous as any),
        ])) as any[];

        const shape = (stats: any) => {
          const visits = Number(stats?.visits ?? 0);
          return {
            visitors: Number(stats?.visitors ?? 0),
            pageviews: Number(stats?.pageviews ?? 0),
            visits,
            bounceRate: visits ? Math.min(Number(stats?.bounces ?? 0), visits) / visits : 0,
            averageVisitSeconds: visits ? Number(stats?.totaltime ?? 0) / visits : 0,
          };
        };

        return text({
          period: { startDate: range.startDate.toISOString(), endDate: range.endDate.toISOString() },
          current: shape(current),
          previous: shape(before),
        });
      },
    },

    {
      name: 'ghostwire_get_metrics',
      title: 'Get a breakdown',
      description:
        'The top values for one dimension over a period: pages, referrers, countries, browsers, operating systems, devices, or the channels visits arrived through.',
      input: {
        websiteId: z.uuid().describe('The website ID.'),
        type: z
          .enum(['path', 'referrer', 'country', 'browser', 'os', 'device', 'channel'])
          .describe('Which dimension to break down by.'),
        limit: z.number().int().min(1).max(100).describe('How many rows. Default 10.').optional(),
        ...dateRange.shape,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ websiteId, type, limit = 10, startDate, endDate }) => {
        await readable(auth, websiteId);
        const range = resolveRange({ startDate, endDate });

        const rows =
          type === 'channel'
            ? await getChannelMetrics(websiteId, range as any)
            : ['path', 'referrer'].includes(type)
              ? await getPageviewMetrics(websiteId, { type, limit }, range as any)
              : await getSessionMetrics(websiteId, { type, limit }, range as any);

        return text({
          type,
          rows: (rows as any[])
            .map(row => ({ value: row.x, count: Number(row.y) }))
            .slice(0, limit),
        });
      },
    },

    {
      name: 'ghostwire_get_timeseries',
      title: 'Get traffic over time',
      description:
        'Page views and visitors per day (or per hour) across a period, for spotting trends and spikes.',
      input: {
        websiteId: z.uuid().describe('The website ID.'),
        unit: z.enum(['hour', 'day', 'month']).describe('Bucket size. Default day.').optional(),
        ...dateRange.shape,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ websiteId, unit = 'day', startDate, endDate }) => {
        await readable(auth, websiteId);
        const range = { ...resolveRange({ startDate, endDate }), unit };

        const [views, visitors] = await Promise.all([
          getPageviewStats(websiteId, range as any),
          getSessionStats(websiteId, range as any),
        ]);

        const series = (rows: unknown[]) =>
          (rows as { x: string | Date; y: unknown }[]).map(row => ({
            at: new Date(row.x).toISOString(),
            count: Number(row.y),
          }));

        return text({ unit, pageviews: series(views as unknown[]), visitors: series(visitors as unknown[]) });
      },
    },

    {
      name: 'ghostwire_get_active_visitors',
      title: 'Get visitors right now',
      description: 'How many people are on the site at this moment.',
      input: { websiteId: z.uuid().describe('The website ID.') },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ websiteId }) => {
        // Live numbers are a visitor count, not identities, but they are still
        // the site's data: the same gate as the rest of the authenticated API.
        if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
          return refuse(`No website ${websiteId}, or you do not have access to it.`);
        }

        const active = await getActiveVisitors(websiteId);

        return text({ websiteId, activeVisitors: Number((active as any)?.visitors ?? active ?? 0) });
      },
    },

    {
      name: 'ghostwire_get_services_status',
      title: 'Get system status',
      description:
        'System monitoring: every service reporting to a site (OpenTelemetry), whether it is up or down and why, its version, and its requests, server error rate and p95 latency over a period (default the last hour).',
      input: { websiteId: z.uuid().describe('The website the services report to.'), ...recentRange.shape },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ websiteId, startDate, endDate }) => {
        await monitorable(auth, websiteId);
        const range = resolveRecentRange({ startDate, endDate });
        const [services, endpoints] = await Promise.all([
          getSystemServices(websiteId),
          getEndpoints(websiteId, range),
        ]);

        return text({
          period: { startDate: range.startDate.toISOString(), endDate: range.endDate.toISOString() },
          services: services.map(s => {
            const own = endpoints.filter(e => e.serviceId === s.id);
            const requests = own.reduce((n, e) => n + e.count, 0);
            const errors = own.reduce((n, e) => n + e.errors, 0);
            return {
              id: s.id,
              namespace: s.namespace,
              name: s.name,
              kind: s.kind,
              status: s.status,
              reason: s.statusReason ?? null,
              version: s.version,
              environment: s.environment,
              lastSeen: s.lastSeen,
              requests,
              errorRate: requests ? round(errors / requests) : null,
              // The slowest endpoint's p95: a service-wide percentile would need the buckets.
              worstEndpointP95Ms: round(Math.max(...own.map(e => e.p95 ?? 0), 0) || null),
            };
          }),
        });
      },
    },

    {
      name: 'ghostwire_get_endpoint_stats',
      title: 'Get endpoint performance',
      description:
        'System monitoring: requests, server error rate and p50/p95/p99 latency (ms) per service, HTTP method and route over a period (default the last hour), busiest first.',
      input: {
        websiteId: z.uuid().describe('The website the services report to.'),
        serviceId: z.uuid().describe('Only this service (an id from ghostwire_get_services_status).').optional(),
        limit: z.number().int().min(1).max(200).describe('How many endpoints. Default 25.').optional(),
        ...recentRange.shape,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ websiteId, serviceId, limit = 25, startDate, endDate }) => {
        await monitorable(auth, websiteId);
        const range = resolveRecentRange({ startDate, endDate });
        const [rows, services] = await Promise.all([
          getEndpoints(websiteId, { ...range, serviceId }),
          getSystemServices(websiteId),
        ]);
        const name = (id: string) => services.find(s => s.id === id)?.name ?? null;

        return text({
          period: { startDate: range.startDate.toISOString(), endDate: range.endDate.toISOString() },
          endpoints: rows.slice(0, limit).map(e => ({
            service: name(e.serviceId),
            method: e.method,
            route: e.route,
            requests: e.count,
            perMinute: round(e.rate),
            errorRate: round(e.errorRate),
            p50Ms: round(e.p50),
            p95Ms: round(e.p95),
            p99Ms: round(e.p99),
          })),
        });
      },
    },

    {
      name: 'ghostwire_get_slow_traces',
      title: 'Get slow or failing requests',
      description:
        'System monitoring: the slowest (or only the failing) requests and job runs over a period (default the last hour), with their trace IDs and a link to each trace in Analytics.',
      input: {
        websiteId: z.uuid().describe('The website the services report to.'),
        serviceId: z.uuid().describe('Only this service.').optional(),
        route: z.string().max(200).describe('Only this route, e.g. "/api/items/{id}".').optional(),
        errorsOnly: z.boolean().describe('Only requests that failed. Default false.').optional(),
        minDurationMs: z.number().min(0).max(86_400_000).describe('Only requests at least this slow.').optional(),
        limit: z.number().int().min(1).max(100).describe('How many. Default 20.').optional(),
        ...recentRange.shape,
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ websiteId, serviceId, route, errorsOnly, minDurationMs, limit = 20, startDate, endDate }) => {
        await monitorable(auth, websiteId);
        const range = resolveRecentRange({ startDate, endDate });
        const { data, count } = await getTraces(websiteId, {
          ...range,
          serviceId,
          route,
          status: errorsOnly ? 'error' : undefined,
          minDurationMs,
          sort: 'slowest',
          pageSize: limit,
        });

        return text({
          period: { startDate: range.startDate.toISOString(), endDate: range.endDate.toISOString() },
          matching: count,
          traces: data.map(t => ({
            traceId: t.traceId,
            service: t.service,
            name: t.name,
            route: t.route,
            durationMs: round(t.durationMs),
            failed: t.status === 2,
            httpStatus: t.httpStatus,
            error: t.statusMessage,
            spans: t.spanCount,
            at: new Date(t.startTime).toISOString(),
            url: `${origin}/websites/${websiteId}/system/traces/${t.traceId}`,
          })),
        });
      },
    },
  ];

  return tools.map(finish);
}
