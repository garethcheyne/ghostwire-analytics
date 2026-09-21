/*
 * The figures behind the traffic report.
 *
 * Kept apart from the rendering so the same numbers can be reused — a
 * scheduled email, a second format, or a test that checks the arithmetic
 * without producing a PDF.
 */
import type { QueryFilters } from '@/lib/types';
import {
  getChannelMetrics,
  getPageviewMetrics,
  getPageviewStats,
  getSessionMetrics,
  getSessionStats,
  getWebsiteStats,
  getVisitorTypeStats,
  getWeeklyTraffic,
} from '@/queries/sql';
import { getPerformanceStats } from '@/queries/sql/performance/getPerformanceStats';

const TOP_N = 8;

/** Six is the ceiling for a readable donut; the rest is folded into "Other". */
const MAX_SEGMENTS = 6;

export interface TrafficReportData {
  visitors: number;
  views: number;
  visits: number;
  /** 0–1. */
  bounceRate: number;
  /** Mean seconds per visit. */
  visitTime: number;
  previous: { visitors: number; views: number; visits: number; bounceRate: number };
  daily: { views: { x: string; y: number }[]; visitors: { x: string; y: number }[] };
  pages: { label: string; value: number }[];
  referrers: { label: string; value: number }[];
  countries: { label: string; value: number }[];
  browsers: { label: string; value: number }[];
  devices: { label: string; value: number }[];
  /** How visits arrived, as a part-to-whole split. */
  channels: { label: string; value: number }[];
  /** Visitors by day of week (0 = Sunday) and hour, as a 7 × 24 grid. */
  activity: number[][];
  /** Core Web Vitals at the 75th percentile, or null when nothing was recorded. */
  vitals: { lcp: number | null; inp: number | null; cls: number | null } | null;
  /** First-time visitors against people coming back. */
  visitorTypes: { newVisitors: number; returningVisitors: number };
}

const count = (value: unknown) => Number(value ?? 0);

/** Channel keys come back as slugs; these are what a client would call them. */
const CHANNEL_NAMES: Record<string, string> = {
  direct: 'Direct',
  referral: 'Referral',
  organicSearch: 'Organic search',
  paidSearch: 'Paid search',
  organicSocial: 'Organic social',
  paidSocial: 'Paid social',
  email: 'Email',
  affiliate: 'Affiliate',
  paidShopping: 'Paid shopping',
  organicShopping: 'Organic shopping',
  organicVideo: 'Organic video',
  paidVideo: 'Paid video',
  display: 'Display',
  sms: 'SMS',
  audio: 'Audio',
  push: 'Push',
  unknown: 'Unknown',
};

/**
 * The biggest few segments, with everything else summed into "Other" — a
 * donut past six slices stops being readable at a glance, which is the only
 * thing a donut is for.
 */
function segments(rows: { x: string | null; y: unknown }[]) {
  const ranked = rows
    .map(row => ({
      label: CHANNEL_NAMES[row.x ?? ''] ?? row.x ?? 'Unknown',
      value: count(row.y),
    }))
    .filter(row => row.value > 0)
    .sort((a, b) => b.value - a.value);

  if (ranked.length <= MAX_SEGMENTS) return ranked;

  const head = ranked.slice(0, MAX_SEGMENTS - 1);
  const tail = ranked.slice(MAX_SEGMENTS - 1);

  return [...head, { label: 'Other', value: tail.reduce((sum, row) => sum + row.value, 0) }];
}

/** A percentile value, or null when the metric was never recorded. */
const vital = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** `{ x, y }` rows from a metrics query, ranked and trimmed to the top few. */
function rank(rows: unknown[], { fallback }: { fallback?: string } = {}) {
  return (rows as { x: string | null; y: unknown }[])
    .map(row => ({ label: row.x || fallback || '', value: count(row.y) }))
    .filter(row => row.label)
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N);
}

/** A day series as `{ x: 'D MMM', y }`, with the raw date kept for sorting. */
function daily(rows: unknown[]) {
  return (rows as { x: string | Date; y: unknown }[])
    .map(row => ({ date: new Date(row.x), y: count(row.y) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map(row => ({
      x: row.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
      y: row.y,
    }));
}

const bounceRateOf = (stats: any) => {
  const visits = count(stats?.visits);
  return visits ? Math.min(count(stats?.bounces), visits) / visits : 0;
};

/**
 * Everything the traffic report shows, for one site over one period, with the
 * equivalent figures for the period before it so each headline can carry a
 * change.
 */
export async function getTrafficReportData(
  websiteId: string,
  filters: QueryFilters,
  previousFilters: QueryFilters,
): Promise<TrafficReportData> {
  const [
    stats,
    previousStats,
    views,
    visitors,
    pages,
    referrers,
    countries,
    browsers,
    devices,
    channels,
    activity,
    performance,
    visitorTypes,
  ] = await Promise.all([
    getWebsiteStats(websiteId, filters) as Promise<any>,
    getWebsiteStats(websiteId, previousFilters) as Promise<any>,
    getPageviewStats(websiteId, { ...filters, unit: 'day' }),
    getSessionStats(websiteId, { ...filters, unit: 'day' }),
    getPageviewMetrics(websiteId, { type: 'path', limit: TOP_N }, filters),
    getPageviewMetrics(websiteId, { type: 'referrer', limit: TOP_N }, filters),
    getSessionMetrics(websiteId, { type: 'country', limit: TOP_N }, filters),
    getSessionMetrics(websiteId, { type: 'browser', limit: TOP_N }, filters),
    getSessionMetrics(websiteId, { type: 'device', limit: TOP_N }, filters),
    getChannelMetrics(websiteId, filters) as Promise<any>,
    getWeeklyTraffic(websiteId, filters),
    // Vitals are only present when the tracker sends them (data-performance),
    // so this is allowed to come back empty rather than being required.
    getPerformanceStats(
      websiteId,
      {
        startDate: filters.startDate as Date,
        endDate: filters.endDate as Date,
        unit: 'day',
        timezone: filters.timezone ?? 'utc',
        metric: 'lcp',
      },
      filters,
    ).catch(() => null),
    getVisitorTypeStats(websiteId, filters),
  ]);

  const visits = count(stats?.visits);

  return {
    visitors: count(stats?.visitors),
    views: count(stats?.pageviews),
    visits,
    bounceRate: bounceRateOf(stats),
    visitTime: visits ? count(stats?.totaltime) / visits : 0,
    previous: {
      visitors: count(previousStats?.visitors),
      views: count(previousStats?.pageviews),
      visits: count(previousStats?.visits),
      bounceRate: bounceRateOf(previousStats),
    },
    daily: { views: daily(views as unknown[]), visitors: daily(visitors as unknown[]) },
    // A visit with no referrer came straight to the site; saying so is more
    // use in a client report than an empty row.
    pages: rank(pages as unknown[], { fallback: '/' }),
    referrers: rank(referrers as unknown[], { fallback: 'Direct / none' }),
    countries: rank(countries as unknown[]),
    browsers: rank(browsers as unknown[]),
    devices: rank(devices as unknown[]),
    channels: segments((channels ?? []) as { x: string | null; y: unknown }[]),
    activity: activity ?? [],
    vitals:
      performance && performance.count
        ? {
            lcp: vital(performance.lcp?.p75),
            inp: vital(performance.inp?.p75),
            cls: vital(performance.cls?.p75),
          }
        : null,
    visitorTypes,
  };
}
