'use client';
import { Area, AreaChart } from 'recharts';
import { type ChartConfig, ChartContainer } from '@/components/ui/chart';

const config = {
  visitors: { label: 'Visitors', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** Tiny visitors trend for list rows. */
export function WebsiteSparkline({ values }: { values: number[] }) {
  const data = values.map((visitors, index) => ({ index, visitors }));

  return (
    <ChartContainer config={config} className="aspect-auto h-8 w-28">
      <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
        <defs>
          <linearGradient id="sparkline-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-visitors)" stopOpacity={0.4} />
            <stop offset="100%" stopColor="var(--color-visitors)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          dataKey="visitors"
          type="monotone"
          stroke="var(--color-visitors)"
          strokeWidth={1.5}
          fill="url(#sparkline-fill)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}
