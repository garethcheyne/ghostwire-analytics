'use client';
import {
  Angry,
  Flame,
  Laptop,
  Monitor,
  MousePointerBan,
  Search,
  Smartphone,
  Tablet,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { RecordingNotice } from '@/components/replays/recording-notice';
import { Card, CardContent } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { type HeatmapMode, useHeatmap } from '@/hooks/queries/heatmaps';
import { formatLongNumber } from '@/lib/format';
import {
  type Breakpoint,
  getBreakpoint,
  getBucketPoints,
  getBucketSpots,
  getBusiestBucket,
  getScreenWidthBuckets,
  getScrollBands,
  getSnapshotHeight,
  type ScreenWidthBucket,
} from '@/lib/heatmap';
import { cn } from '@/lib/utils';
import { type FrustrationMarker, HeatmapStage } from './heatmap-stage';

const BREAKPOINTS: { id: Breakpoint; label: string }[] = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Mobile' },
];

function WidthIcon({ width }: { width: number }) {
  const Icon = width < 768 ? Smartphone : width < 1024 ? Tablet : width < 1600 ? Laptop : Monitor;
  return <Icon />;
}

function WidthSelect({
  buckets,
  value,
  unit,
  onChange,
}: {
  buckets: ScreenWidthBucket[];
  value: number;
  unit: string;
  onChange: (width: number) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={next => onChange(Number(next))}>
      <SelectTrigger size="sm" aria-label="Screen width" className="min-w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {BREAKPOINTS.map(({ id, label }) => {
          const items = buckets.filter(bucket => getBreakpoint(bucket.width) === id).reverse();
          if (!items.length) return null;

          return (
            <SelectGroup key={id}>
              <SelectLabel>{label}</SelectLabel>
              {items.map(bucket => (
                <SelectItem key={bucket.width} value={String(bucket.width)}>
                  <WidthIcon width={bucket.width} />
                  {bucket.width}px
                  <span className="ml-auto pl-3 text-muted-foreground tabular-nums">
                    {formatLongNumber(bucket.count)} {unit}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function NoData({ title, description }: { title: string; description: string }) {
  return (
    <Empty className="min-h-80 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Flame />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function PageHeatmap({
  websiteId,
  mode,
  urlPath,
  width,
  onWidthChange,
}: {
  websiteId: string;
  mode: HeatmapMode;
  urlPath: string;
  width: number | null;
  onWidthChange: (width: number) => void;
}) {
  // Keyed by mode and page in the parent, so this never shows another page's data.
  const { data: current, isPending } = useHeatmap(websiteId, mode, urlPath);

  const buckets = useMemo(() => {
    if (!current) return [];

    return mode === 'click'
      ? getScreenWidthBuckets(current.points)
      : getScreenWidthBuckets(
          current.scroll.buckets.map(row => ({ ...row, count: row.sessions })),
          'weightedAverage',
        );
  }, [current, mode]);

  const bucket = buckets.find(item => item.width === width) ?? getBusiestBucket(buckets);
  const points = useMemo(
    () => (current && bucket && mode === 'click' ? getBucketPoints(current.points, bucket) : []),
    [current, bucket, mode],
  );
  const bands = useMemo(
    () => (current && mode === 'scroll' ? getScrollBands(current.scroll, bucket) : []),
    [current, bucket, mode],
  );
  const [layers, setLayers] = useState<string[]>(['rage', 'dead']);
  const frustration = useMemo(() => {
    if (!current || !bucket || mode !== 'click') return { rage: [], dead: [] };

    return {
      rage: getBucketSpots(current.frustration.rage, bucket),
      dead: getBucketSpots(current.frustration.dead, bucket),
    };
  }, [current, bucket, mode]);
  const markers: FrustrationMarker[] = [
    ...(layers.includes('dead')
      ? frustration.dead.map(spot => ({ ...spot, kind: 'dead' as const }))
      : []),
    ...(layers.includes('rage')
      ? frustration.rage.map(spot => ({ ...spot, kind: 'rage' as const }))
      : []),
  ];
  const rageVisits = frustration.rage.reduce((sum, spot) => sum + spot.visits, 0);
  const deadClicks = frustration.dead.reduce((sum, spot) => sum + spot.clicks, 0);

  if (isPending) {
    return <Skeleton className="h-[36rem] w-full" />;
  }

  if (!bucket) {
    return (
      <NoData
        title={mode === 'click' ? 'No clicks' : 'No scroll data'}
        description="Nothing recorded on this page for the selected period and filters."
      />
    );
  }

  const unit = mode === 'click' ? 'clicks' : 'visits';
  const height = Math.max(640, getSnapshotHeight(bucket.pageH, bucket.viewportH));
  const recorded =
    bucket.minViewportW === bucket.maxViewportW
      ? `recorded at ${bucket.minViewportW}px`
      : `recorded at ${bucket.minViewportW}–${bucket.maxViewportW}px`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {formatLongNumber(bucket.count)} {unit}
          </span>{' '}
          on <span className="font-mono">{urlPath}</span>, {recorded}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {mode === 'click' && (
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              value={layers}
              onValueChange={setLayers}
              aria-label="Frustration markers"
            >
              <ToggleGroupItem
                value="rage"
                disabled={!rageVisits}
                title="3+ clicks on the same spot within a second"
              >
                <Angry />
                {rageVisits} rage
              </ToggleGroupItem>
              <ToggleGroupItem
                value="dead"
                disabled={!deadClicks}
                title="Clicks with no response within a second"
              >
                <MousePointerBan />
                {deadClicks} dead
              </ToggleGroupItem>
            </ToggleGroup>
          )}
          <WidthSelect
            buckets={buckets}
            value={bucket.width}
            unit={unit}
            onChange={onWidthChange}
          />
        </div>
      </div>
      <HeatmapStage
        url={current?.snapshot?.url ?? null}
        width={bucket.width}
        height={height}
        points={mode === 'click' ? points : undefined}
        bands={mode === 'scroll' ? bands : undefined}
        markers={mode === 'click' ? markers : undefined}
      />
    </div>
  );
}

export function HeatmapsView() {
  const { id } = useCurrentWebsite();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mode: HeatmapMode = searchParams.get('mode') === 'scroll' ? 'scroll' : 'click';
  const selectedUrl = searchParams.get('url');
  const width = Number(searchParams.get('width')) || null;
  const [search, setSearch] = useState('');
  const { data, isPending } = useHeatmap(id, mode);

  const setParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) =>
      value ? params.set(key, value) : params.delete(key),
    );
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const pages = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data?.pages ?? []).filter(page => !term || page.urlPath.toLowerCase().includes(term));
  }, [data, search]);

  const urlPath =
    selectedUrl && data?.pages.some(page => page.urlPath === selectedUrl)
      ? selectedUrl
      : data?.pages[0]?.urlPath;

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Heatmaps" />
      <RecordingNotice websiteId={id} kind="heatmaps" />
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={mode}
              onValueChange={value =>
                value && setParams({ mode: value === 'scroll' ? 'scroll' : null })
              }
            >
              <ToggleGroupItem value="click">Clicks</ToggleGroupItem>
              <ToggleGroupItem value="scroll">Scroll depth</ToggleGroupItem>
            </ToggleGroup>
          </div>

          {isPending ? (
            <Skeleton className="h-[36rem] w-full" />
          ) : !data?.pages.length ? (
            <NoData
              title="No heatmap data"
              description="No clicks or scrolls were recorded in this period. Try a longer date range."
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
              <div className="flex flex-col gap-2">
                <InputGroup>
                  <InputGroupInput
                    placeholder="Search pages"
                    value={search}
                    onChange={event => setSearch(event.target.value)}
                  />
                  <InputGroupAddon>
                    <Search />
                  </InputGroupAddon>
                </InputGroup>
                <ScrollArea className="max-h-56 lg:max-h-[36rem]">
                  <ul className="flex flex-col gap-0.5">
                    {pages.map(page => (
                      <li key={page.urlPath}>
                        <button
                          type="button"
                          onClick={() => setParams({ url: page.urlPath })}
                          title={`${page.sessions} visits · ${page.count} ${mode === 'click' ? 'clicks' : 'scroll events'}`}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                            page.urlPath === urlPath && 'bg-muted font-medium',
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate font-mono text-xs">
                            {page.urlPath}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatLongNumber(page.sessions)}
                          </span>
                        </button>
                      </li>
                    ))}
                    {!pages.length && (
                      <li className="px-2 py-1.5 text-sm text-muted-foreground">
                        No matching pages
                      </li>
                    )}
                  </ul>
                </ScrollArea>
              </div>
              {urlPath && (
                <PageHeatmap
                  key={`${mode}:${urlPath}`}
                  websiteId={id}
                  mode={mode}
                  urlPath={urlPath}
                  width={width}
                  onWidthChange={next => setParams({ width: String(next) })}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
