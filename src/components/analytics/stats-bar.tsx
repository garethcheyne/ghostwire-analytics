'use client';
import { useWebsiteStats } from '@/hooks/queries/analytics';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import { type Stat, StatCards } from './stat-cards';

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

/** Overview headline numbers: visitors, visits, views, bounce rate, visit duration. */
export function StatsBar({ websiteId }: { websiteId: string }) {
  const { data } = useWebsiteStats(websiteId);

  if (!data) {
    return <StatCards loading />;
  }

  const { visitors, visits, pageviews, bounces, totaltime, comparison: prev } = data;

  const stats: Stat[] = [
    { label: 'Visitors', value: visitors, previous: prev.visitors, format: formatLongNumber },
    { label: 'Visits', value: visits, previous: prev.visits, format: formatLongNumber },
    { label: 'Views', value: pageviews, previous: prev.pageviews, format: formatLongNumber },
    {
      label: 'Bounce rate',
      value: ratio(Math.min(visits, bounces), visits) * 100,
      previous: ratio(Math.min(prev.visits, prev.bounces), prev.visits) * 100,
      format: n => `${Math.round(n)}%`,
      lowerIsBetter: true,
    },
    {
      label: 'Visit duration',
      value: ratio(totaltime, visits),
      previous: ratio(prev.totaltime, prev.visits),
      format: n => formatShortTime(n, ['m', 's'], ' '),
    },
  ];

  return <StatCards stats={stats} />;
}
