/*
 * The tools the MCP endpoint exposes.
 *
 * Two jobs, matching what an agent is actually asked to do: set a site up so
 * it starts reporting, and answer "how is it doing?". Everything else —
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
import type { McpTool, ToolResult } from './protocol';

/** Somewhere for the tools to point people at, for the tracker snippet. */
export const appUrl = () =>
  (process.env.APP_URL || process.env.BETTER_AUTH_URL || '').replace(/\/+$/, '');

const text = (value: unknown): ToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>,
});

const refuse = (message: string): ToolResult => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

/** The tags a site pastes in, built the same way the settings screen builds them. */
function trackingSnippet(websiteId: string, { errors, replays }: { errors: boolean; replays: boolean }) {
  const origin = appUrl() || 'https://your-ghostwire-host';
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
    throw new Error('startDate and endDate must be ISO 8601 dates, e.g. "2026-09-01".');
  }

  if (start > end) {
    throw new Error('startDate is after endDate.');
  }

  return { startDate: start, endDate: end };
}

/** Every tool that names a website checks the caller may see it before anything else. */
async function readable(auth: Auth, websiteId: string) {
  if (!(await canViewWebsite(auth, websiteId))) {
    throw new Error(`No website ${websiteId}, or you do not have access to it.`);
  }

  const website = await getWebsite(websiteId);
  if (!website) throw new Error(`No website ${websiteId}.`);

  return website;
}

const schema = (shape: z.ZodRawShape) => z.toJSONSchema(z.object(shape)) as Record<string, unknown>;

export function buildTools(auth: Auth): McpTool[] {
  return [
    {
      name: 'ghostwire_list_websites',
      title: 'List websites',
      description:
        'List the websites this API key can see, with their IDs and whether error reporting and session replay are switched on.',
      inputSchema: schema({}),
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
      inputSchema: schema({
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
      }),
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
          trackingSnippet: trackingSnippet(website.id, {
            errors: enableErrors,
            replays: enableReplays,
          }),
          next: 'Paste the snippet into the site’s <head>. For a framework integration, ask for the ghostwire-analytics skill.',
        });
      },
    },

    {
      name: 'ghostwire_get_website',
      title: 'Get a website',
      description:
        'Fetch one website by ID, with its settings and the tracker snippet for pasting into the site.',
      inputSchema: schema({ websiteId: z.uuid().describe('The website ID.') }),
      annotations: { readOnlyHint: true, openWorldHint: false },
      handler: async ({ websiteId }) => {
        const website = await readable(auth, websiteId);

        return text({
          ...websiteSummary(website),
          trackingSnippet: trackingSnippet(website.id, {
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
      inputSchema: schema({
        websiteId: z.uuid().describe('The website ID.'),
        name: z.string().trim().min(1).max(100).optional(),
        domain: z.string().trim().max(500).optional(),
        enableErrors: z.boolean().optional(),
        enableReplays: z.boolean().optional(),
      }),
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
        'Issue the ingest key a server uses to report errors from the back end (the gwe_ key). The key is shown once and cannot be retrieved later; issuing a new one replaces any existing key, so anything still using the old one stops reporting.',
      inputSchema: schema({ websiteId: z.uuid().describe('The website ID.') }),
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
      name: 'ghostwire_get_stats',
      title: 'Get headline stats',
      description:
        'Visitors, page views, visits, bounce rate and average visit time for a period, with the same figures for the preceding period of equal length so changes can be reported.',
      inputSchema: schema({ websiteId: z.uuid().describe('The website ID.'), ...dateRange.shape }),
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
      inputSchema: schema({
        websiteId: z.uuid().describe('The website ID.'),
        type: z
          .enum(['path', 'referrer', 'country', 'browser', 'os', 'device', 'channel'])
          .describe('Which dimension to break down by.'),
        limit: z.number().int().min(1).max(100).describe('How many rows. Default 10.').optional(),
        ...dateRange.shape,
      }),
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
      inputSchema: schema({
        websiteId: z.uuid().describe('The website ID.'),
        unit: z.enum(['hour', 'day', 'month']).describe('Bucket size. Default day.').optional(),
        ...dateRange.shape,
      }),
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
      inputSchema: schema({ websiteId: z.uuid().describe('The website ID.') }),
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
  ];
}
