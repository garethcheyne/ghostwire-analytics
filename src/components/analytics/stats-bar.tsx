'use client';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useWebsiteStats } from '@/hooks/queries/analytics';
import { formatLongNumber, formatShortTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Stat {
  label: string;
  value: number;
  previous: number;
  format: (value: number) => string;
  /** For bounce rate, going down is good. */
  lowerIsBetter?: boolean;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

function Change({ stat }: { stat: Stat }) {
  const { value, previous, lowerIsBetter } = stat;

  if (!previous || !Number.isFinite(previous)) {
    return null;
  }

  const percent = ((value - previous) / previous) * 100;

  if (!Number.isFinite(percent) || Math.round(percent) === 0) {
    return <span className="text-xs text-muted-foreground">No change</span>;
  }

  const up = percent > 0;
  const good = lowerIsBetter ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'flex items-center gap-0.5 text-xs font-medium',
        good ? 'text-status-online' : 'text-destructive',
      )}
    >
      <Icon className="size-3.5" />
      {Math.abs(Math.round(percent))}%
    </span>
  );
}

export function StatsBar({ websiteId }: { websiteId: string }) {
  const { data, isPending } = useWebsiteStats(websiteId);

  if (isPending || !data) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[0, 1, 2, 3, 4].map(i => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
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

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {stats.map(stat => (
        <Card key={stat.label} className="gap-2 py-4">
          <CardContent className="flex flex-col gap-1 px-4">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {stat.label}
            </span>
            <span className="text-2xl font-semibold tabular-nums">{stat.format(stat.value)}</span>
            <Change stat={stat} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
