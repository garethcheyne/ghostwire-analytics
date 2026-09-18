'use client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWeeklyTraffic } from '@/hooks/queries/analytics';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function hourLabel(hour: number) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString('en-US', { hour: 'numeric' });
}

/** Sessions by day of week and hour of day, as a heat grid. */
export function WeeklyTraffic({ websiteId }: { websiteId: string }) {
  const { data, isPending } = useWeeklyTraffic(websiteId);
  const max = Math.max(1, ...(data ?? []).flat());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly traffic</CardTitle>
        <CardDescription>Visitors by day and hour, in your timezone</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {isPending || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="grid min-w-[640px] grid-cols-[auto_repeat(24,minmax(0,1fr))] gap-1 text-xs">
            <span />
            {Array.from({ length: 24 }, (_, hour) => (
              <span key={hour} className="text-center text-muted-foreground">
                {hour % 3 === 0 ? hourLabel(hour) : ''}
              </span>
            ))}
            {data.map((hours, day) => (
              <div key={DAYS[day]} className="contents">
                <span className="pr-2 text-muted-foreground">{DAYS[day]}</span>
                {hours.map((count, hour) => (
                  <Tooltip key={hour}>
                    <TooltipTrigger asChild>
                      <div
                        className="aspect-square rounded-sm bg-muted"
                        style={
                          count
                            ? {
                                backgroundColor: `color-mix(in oklab, var(--primary) ${20 + Math.round((count / max) * 80)}%, var(--muted))`,
                              }
                            : undefined
                        }
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {DAYS[day]} {hourLabel(hour)}: {count} {count === 1 ? 'visitor' : 'visitors'}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
