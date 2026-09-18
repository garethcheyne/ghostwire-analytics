/*
 * Email reports: a weekly (Mondays) or monthly (on the 1st) summary per user of the websites they
 * can see: visitors, views, bounce rate and visit time against the period before, top pages and
 * sources, and errors. Sent after 07:00 UTC through SMTP (see lib/notify).
 */
import { appUrl, isEmailConfigured, sendEmail } from '@/lib/notify';
import prisma from '@/lib/prisma';
import { getPageviewMetrics, getWebsiteStats } from '@/queries/sql';
import { getErrorStats } from '@/queries/sql/errors/getErrors';

export type ReportFrequency = 'weekly' | 'monthly';

const MAX_WEBSITES = 20;
const SEND_AFTER_HOUR_UTC = 7;
const INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** The period a report covers: the last 7 full days, or last calendar month (UTC). */
export function reportPeriod(frequency: ReportFrequency, now = new Date()) {
  // UTC arithmetic throughout, so daylight-saving changes don't shift the period.
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  if (frequency === 'monthly') {
    const endDate = new Date(Date.UTC(year, month, 1));
    return {
      startDate: new Date(Date.UTC(year, month - 1, 1)),
      endDate: new Date(endDate.getTime() - 1),
      previousStart: new Date(Date.UTC(year, month - 2, 1)),
    };
  }

  const today = startOfUtcDay(now);
  const startDate = new Date(today.getTime() - 7 * DAY_MS);
  return {
    startDate,
    endDate: new Date(today.getTime() - 1),
    previousStart: new Date(startDate.getTime() - 7 * DAY_MS),
  };
}

/** Whether a subscription is due now (and hasn't been sent for this period). */
export function isReportDue(frequency: string, lastSentAt: Date | null, now = new Date()) {
  if (now.getUTCHours() < SEND_AFTER_HOUR_UTC) return false;
  const since = lastSentAt ? now.getTime() - lastSentAt.getTime() : Infinity;

  if (frequency === 'weekly') return now.getUTCDay() === 1 && since > 6 * 24 * 3600 * 1000;
  if (frequency === 'monthly') return now.getUTCDate() === 1 && since > 20 * 24 * 3600 * 1000;
  return false;
}

interface WebsiteSummary {
  id: string;
  name: string;
  visitors: number;
  views: number;
  bounceRate: number;
  visitTime: number;
  previous: { visitors: number; views: number };
  pages: { x: string; y: number }[];
  sources: { x: string; y: number }[];
  errors: number;
  newErrors: number;
}

async function summarize(
  website: { id: string; name: string },
  period: ReturnType<typeof reportPeriod>,
): Promise<WebsiteSummary> {
  const filters = { startDate: period.startDate, endDate: period.endDate } as any;
  const previousFilters = {
    startDate: period.previousStart,
    endDate: new Date(period.startDate.getTime() - 1),
  } as any;

  const [stats, previous, pages, sources, errors] = await Promise.all([
    getWebsiteStats(website.id, filters) as Promise<any>,
    getWebsiteStats(website.id, previousFilters) as Promise<any>,
    getPageviewMetrics(website.id, { type: 'path', limit: 5 }, filters),
    getPageviewMetrics(website.id, { type: 'referrer', limit: 5 }, filters),
    getErrorStats(website.id, { ...filters, unit: 'day' }),
  ]);

  const visits = Number(stats?.visits ?? 0);

  return {
    id: website.id,
    name: website.name,
    visitors: Number(stats?.visitors ?? 0),
    views: Number(stats?.pageviews ?? 0),
    bounceRate: visits ? Math.min(Number(stats.bounces), visits) / visits : 0,
    visitTime: visits ? Number(stats.totaltime) / visits : 0,
    previous: {
      visitors: Number(previous?.visitors ?? 0),
      views: Number(previous?.pageviews ?? 0),
    },
    pages: (pages as any[]).map(row => ({ x: row.x || '/', y: Number(row.y) })),
    sources: (sources as any[]).filter(row => row.x).map(row => ({ x: row.x, y: Number(row.y) })),
    errors: Number(errors?.events ?? 0),
    newErrors: Number(errors?.newGroups ?? 0),
  };
}

const number = (value: number) => Math.round(value).toLocaleString('en-US');

function change(current: number, previous: number) {
  if (!previous) return current ? 'new' : '–';
  const percent = Math.round(((current - previous) / previous) * 100);
  return `${percent > 0 ? '+' : ''}${percent}%`;
}

function duration(seconds: number) {
  const s = Math.round(seconds);
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
}

const escape = (value: string) =>
  value.replace(
    /[&<>"]/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!,
  );

/** Plain text and HTML for the report email. */
export function renderReport(
  summaries: WebsiteSummary[],
  frequency: ReportFrequency,
  period: ReturnType<typeof reportPeriod>,
) {
  const label = frequency === 'weekly' ? 'week' : 'month';
  const range = `${period.startDate.toISOString().slice(0, 10)} to ${period.endDate.toISOString().slice(0, 10)}`;

  const text = [
    `Your ${frequency} Ghostwire Analytics report (${range})`,
    ...summaries.flatMap(site => [
      '',
      `${site.name}`,
      `  Visitors ${number(site.visitors)} (${change(site.visitors, site.previous.visitors)} on last ${label}) · Views ${number(site.views)} (${change(site.views, site.previous.views)})`,
      `  Bounce rate ${Math.round(site.bounceRate * 100)}% · Visit time ${duration(site.visitTime)}`,
      ...(site.errors ? [`  Errors ${number(site.errors)} (${site.newErrors} new)`] : []),
      ...(site.pages.length
        ? [`  Top pages: ${site.pages.map(p => `${p.x} (${p.y})`).join(', ')}`]
        : []),
      ...(site.sources.length
        ? [`  Top sources: ${site.sources.map(p => `${p.x} (${p.y})`).join(', ')}`]
        : []),
      ...(appUrl() ? [`  ${appUrl(`/websites/${site.id}`)}`] : []),
    ]),
  ].join('\n');

  const cell = 'padding:4px 12px 4px 0;font-size:13px';
  const html = `<div style="font-family:system-ui,sans-serif;color:#0f172a;max-width:640px">
<h2 style="font-size:18px;margin:0 0 4px">Your ${frequency} report</h2>
<p style="margin:0 0 16px;color:#64748b;font-size:13px">${range}</p>
${summaries
  .map(
    site => `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:12px">
<h3 style="font-size:15px;margin:0 0 8px">${
      appUrl()
        ? `<a href="${escape(appUrl(`/websites/${site.id}`)!)}" style="color:#0ea5e9;text-decoration:none">${escape(site.name)}</a>`
        : escape(site.name)
    }</h3>
<table style="border-collapse:collapse;margin-bottom:8px"><tr>
<td style="${cell}"><b>${number(site.visitors)}</b> visitors <span style="color:#64748b">${change(site.visitors, site.previous.visitors)}</span></td>
<td style="${cell}"><b>${number(site.views)}</b> views <span style="color:#64748b">${change(site.views, site.previous.views)}</span></td>
<td style="${cell}"><b>${Math.round(site.bounceRate * 100)}%</b> bounce</td>
<td style="${cell}"><b>${duration(site.visitTime)}</b> per visit</td>
</tr></table>
${site.errors ? `<p style="margin:0 0 8px;font-size:13px;color:#dc2626">${number(site.errors)} errors, ${site.newErrors} new</p>` : ''}
${
  site.pages.length
    ? `<p style="margin:0 0 4px;font-size:13px;color:#64748b">Top pages: ${site.pages.map(p => `${escape(p.x)} (${p.y})`).join(', ')}</p>`
    : ''
}
${
  site.sources.length
    ? `<p style="margin:0;font-size:13px;color:#64748b">Top sources: ${site.sources.map(p => `${escape(p.x)} (${p.y})`).join(', ')}</p>`
    : ''
}
</div>`,
  )
  .join('\n')}
<p style="font-size:12px;color:#94a3b8">Change or stop these emails in Settings → Notifications.</p>
</div>`;

  return { subject: `Your ${frequency} analytics: ${range}`, text, html };
}

/** Websites a user can see (own and teams'), limited to their chosen ones when set. */
async function reportWebsites(userId: string, websiteIds: string[]) {
  return prisma.client.website.findMany({
    where: {
      deletedAt: null,
      ...(websiteIds.length && { id: { in: websiteIds } }),
      OR: [{ userId }, { team: { members: { some: { userId } } } }],
    },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
    take: MAX_WEBSITES,
  });
}

/** Builds and emails a user's report now. */
export async function sendReport(
  userId: string,
  frequency: ReportFrequency,
  websiteIds: string[] = [],
) {
  const user = await prisma.client.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) throw new Error('The user has no email address.');

  const websites = await reportWebsites(userId, websiteIds);
  if (!websites.length) throw new Error('No websites to report on.');

  const period = reportPeriod(frequency);
  const summaries: WebsiteSummary[] = [];
  for (const website of websites) summaries.push(await summarize(website, period));

  const { subject, text, html } = renderReport(summaries, frequency, period);
  await sendEmail([user.email], subject, { text, html });
}

/** Sends every report that's due; each is claimed first so only one instance sends it. */
export async function runEmailReports(now = new Date()) {
  if (!isEmailConfigured()) return;

  const reports = await prisma.client.emailReport.findMany();

  for (const report of reports) {
    if (!isReportDue(report.frequency, report.lastSentAt, now)) continue;

    const { count } = await prisma.client.emailReport.updateMany({
      where: { id: report.id, lastSentAt: report.lastSentAt },
      data: { lastSentAt: now },
    });
    if (count !== 1) continue;

    try {
      await sendReport(report.userId, report.frequency as ReportFrequency, report.websiteIds);
    } catch (e) {
      console.error(`Email report for ${report.userId} failed:`, e);
    }
  }
}

let started = false;

export function startEmailReportSchedule() {
  if (started) return;
  started = true;

  setInterval(() => void runEmailReports().catch(() => {}), INTERVAL_MS).unref?.();
}
