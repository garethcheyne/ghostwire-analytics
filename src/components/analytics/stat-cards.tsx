'use client';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export interface Stat {
  label: string;
  value: number;
  /** Same figure for the comparison period; omit to hide the change. */
  previous?: number;
  format: (value: number) => string;
  /** For e.g. bounce rate, going down is good. */
  lowerIsBetter?: boolean;
}

function Change({ stat }: { stat: Stat }) {
  const { value, previous, lowerIsBetter } = stat;

  if (previous === undefined || !previous || !Number.isFinite(previous)) {
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

const COLUMNS: Record<number, string> = {
  3: '@xl:grid-cols-3',
  4: '@2xl:grid-cols-4',
  5: '@2xl:grid-cols-5',
  6: '@3xl:grid-cols-6',
};

// Columns follow the space available (container queries), so the row also fits board widgets.
/** Row of headline numbers with change against the comparison period. */
export function StatCards({ stats, loading }: { stats?: Stat[]; loading?: boolean }) {
  const count = stats?.length ?? 5;
  const grid = cn('grid grid-cols-2 gap-4', COLUMNS[count] ?? '@2xl:grid-cols-4');

  if (loading || !stats) {
    return (
      <div className="@container">
        <div className={grid}>
          {Array.from({ length: count }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="@container">
      <div className={grid}>
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
    </div>
  );
}
