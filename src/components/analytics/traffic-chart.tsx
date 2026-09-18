'use client';
import { format, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { StickyNote } from 'lucide-react';
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useWebsitePageviews } from '@/hooks/queries/analytics';
import { useAnnotations } from '@/hooks/queries/annotations';
import { useDateRange } from '@/hooks/use-date-range';
import { DATE_FORMATS, generateTimeSeries } from '@/lib/date';
import { AnnotationsDialog, formatAnnotationDate, useShowAnnotation } from './annotations-dialog';

const config = {
  visitors: { label: 'Visitors', color: 'var(--chart-1)' },
  views: { label: 'Views', color: 'var(--chart-2)' },
} satisfies ChartConfig;

// Axis labels per bucket size; generateTimeSeries keys buckets with Umami's DATE_FORMATS.
const TICK_FORMAT: Record<string, Intl.DateTimeFormatOptions> = {
  minute: { hour: 'numeric', minute: '2-digit' },
  hour: { hour: 'numeric' },
  day: { day: 'numeric', month: 'short' },
  month: { month: 'short', year: 'numeric' },
  year: { year: 'numeric' },
};

export function TrafficChart({ websiteId }: { websiteId: string }) {
  const { startDate, endDate, unit, timezone, params } = useDateRange();
  const { data, isPending } = useWebsitePageviews(websiteId);
  const { data: annotationData } = useAnnotations(websiteId, {
    startAt: params.startAt,
    endAt: params.endAt,
  });
  const showAnnotation = useShowAnnotation();
  const bucketFormat = DATE_FORMATS[unit as keyof typeof DATE_FORMATS] ?? DATE_FORMATS.day;

  const series = useMemo(() => {
    if (!data) return [];

    const visitors = generateTimeSeries(data.sessions, startDate, endDate, unit, 'en-US');
    const views = generateTimeSeries(data.pageviews, startDate, endDate, unit, 'en-US');

    return visitors.map((point, index) => ({
      label: point.x,
      visitors: point.y ?? 0,
      views: views[index]?.y ?? 0,
    }));
  }, [data, startDate, endDate, unit]);

  // Each note sits on the bucket it falls in (buckets are wall-clock times in the viewer's timezone).
  const markers = useMemo(() => {
    const byBucket = new Map<string, number>();

    (annotationData?.data ?? []).forEach(annotation => {
      const bucket = format(toZonedTime(annotation.date, timezone), bucketFormat);
      byBucket.set(bucket, (byBucket.get(bucket) ?? 0) + 1);
    });

    return [...byBucket.entries()];
  }, [annotationData, timezone, bucketFormat]);

  const tickFormatter = (value: string) => {
    const date = parse(value, bucketFormat, new Date());
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleString('en-US', TICK_FORMAT[unit] ?? TICK_FORMAT.day);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traffic</CardTitle>
        <CardDescription>Visitors and page views per {unit}</CardDescription>
        <CardAction>
          <AnnotationsDialog />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isPending ? (
          <Skeleton className="h-72 w-full" />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-72 w-full">
            <BarChart data={series} margin={{ top: 16, left: 0, right: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={24}
                tickFormatter={tickFormatter}
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} width="auto" />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                content={
                  <ChartTooltipContent labelFormatter={label => tickFormatter(String(label))} />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="visitors" fill="var(--color-visitors)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="views" fill="var(--color-views)" radius={[3, 3, 0, 0]} />
              {markers.map(([bucket, count]) => (
                <ReferenceLine
                  key={bucket}
                  x={bucket}
                  stroke="var(--chart-4)"
                  strokeDasharray="4 3"
                  label={{
                    value: count > 1 ? `${count} notes` : 'Note',
                    position: 'top',
                    fill: 'var(--muted-foreground)',
                    fontSize: 11,
                  }}
                />
              ))}
            </BarChart>
          </ChartContainer>
        )}
        {!!annotationData?.data.length && (
          <div className="flex flex-wrap gap-2">
            {annotationData.data.map(annotation => (
              <Tooltip key={annotation.id}>
                <TooltipTrigger asChild>
                  <Badge variant="outline" asChild>
                    <button type="button" onClick={() => showAnnotation(annotation)}>
                      <StickyNote />
                      <span className="text-muted-foreground">
                        {formatAnnotationDate(annotation, timezone)}
                      </span>
                      <span className="max-w-64 truncate">{annotation.note}</span>
                    </button>
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs whitespace-pre-wrap">
                  {annotation.note}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
