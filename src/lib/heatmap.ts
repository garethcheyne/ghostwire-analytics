/*
 * Client-side heatmap helpers, ported from Umami's Heatmap.tsx. Recorded clicks and scrolls
 * come from many screen sizes; they're grouped into standard widths, scaled to that width,
 * and drawn over the page rendered at the same width.
 */
import type {
  HeatmapFrustrationSpot,
  HeatmapPoint,
  HeatmapResult,
} from '@/queries/sql/heatmap/getHeatmap';

export const SCREEN_WIDTHS = [320, 375, 425, 768, 1024, 1440, 1920] as const;

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

/** Ghostwire breakpoints: mobile < 768, tablet < 1024, desktop otherwise. */
export function getBreakpoint(width: number): Breakpoint {
  return width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
}

export interface ScreenWidthBucket {
  width: number;
  viewportH: number;
  pageW: number;
  pageH: number;
  /** Distinct positions (clicks) or rows (scroll) that fell into this width. */
  positions: number;
  count: number;
  minViewportW: number;
  maxViewportW: number;
}

interface Metric {
  pageW: number;
  pageH: number;
  viewportW: number;
  viewportH: number;
  count: number;
}

export function getNearestWidth(viewportW: number) {
  return SCREEN_WIDTHS.reduce((best, width) =>
    Math.abs(viewportW - width) < Math.abs(viewportW - best) ? width : best,
  );
}

/**
 * Groups metrics by nearest standard width. Page size is the largest seen ('max', for clicks, so
 * no click falls off the page) or the count-weighted average ('weightedAverage', for scroll).
 */
export function getScreenWidthBuckets(
  metrics: Metric[],
  pageSize: 'max' | 'weightedAverage' = 'max',
): ScreenWidthBucket[] {
  const buckets = new Map<
    number,
    ScreenWidthBucket & { sumW: number; sumH: number; sumVH: number }
  >();

  for (const metric of metrics) {
    const width = getNearestWidth(metric.viewportW);
    const scale = width / Math.max(1, metric.viewportW);
    const viewportH = metric.viewportH * scale;
    const pageW = Math.max(width, metric.pageW * scale);
    const pageH = Math.max(viewportH, metric.pageH * scale);
    const bucket = buckets.get(width);

    if (bucket) {
      bucket.positions += 1;
      bucket.count += metric.count;
      bucket.pageW = Math.max(bucket.pageW, pageW);
      bucket.pageH = Math.max(bucket.pageH, pageH);
      bucket.sumW += pageW * metric.count;
      bucket.sumH += pageH * metric.count;
      bucket.sumVH += viewportH * metric.count;
      bucket.minViewportW = Math.min(bucket.minViewportW, metric.viewportW);
      bucket.maxViewportW = Math.max(bucket.maxViewportW, metric.viewportW);
    } else {
      buckets.set(width, {
        width,
        viewportH,
        pageW,
        pageH,
        positions: 1,
        count: metric.count,
        minViewportW: metric.viewportW,
        maxViewportW: metric.viewportW,
        sumW: pageW * metric.count,
        sumH: pageH * metric.count,
        sumVH: viewportH * metric.count,
      });
    }
  }

  return SCREEN_WIDTHS.flatMap(width => {
    const bucket = buckets.get(width);
    if (!bucket) return [];

    const { sumW, sumH, sumVH, ...rest } = bucket;
    const count = Math.max(1, rest.count);

    return [
      {
        ...rest,
        viewportH: Math.max(1, Math.round(sumVH / count)),
        pageW: Math.max(
          width,
          Math.round(pageSize === 'weightedAverage' ? sumW / count : rest.pageW),
        ),
        pageH: Math.max(
          640,
          Math.round(pageSize === 'weightedAverage' ? sumH / count : rest.pageH),
        ),
      },
    ];
  });
}

/** The width with the most data, used as the default selection. */
export function getBusiestBucket(buckets: ScreenWidthBucket[]) {
  return buckets.reduce<ScreenWidthBucket | null>(
    (best, bucket) => (!best || bucket.count > best.count ? bucket : best),
    null,
  );
}

/** Click points in one width bucket, scaled to it and merged when they land on the same pixel. */
export function getBucketPoints(points: HeatmapPoint[], bucket: ScreenWidthBucket) {
  const merged = new Map<string, { pageX: number; pageY: number; count: number }>();

  for (const point of points) {
    if (getNearestWidth(point.viewportW) !== bucket.width) continue;

    const scale = bucket.width / Math.max(1, point.viewportW);
    const pageX = Math.round(point.pageX * scale);
    const pageY = Math.round(point.pageY * scale);
    const key = `${pageX}:${pageY}`;
    const existing = merged.get(key);

    if (existing) existing.count += point.count;
    else merged.set(key, { pageX, pageY, count: point.count });
  }

  return [...merged.values()];
}

/** Rage or dead click spots in one width bucket, scaled to it and merged by position. */
export function getBucketSpots(spots: HeatmapFrustrationSpot[], bucket: ScreenWidthBucket) {
  const merged = new Map<
    string,
    { pageX: number; pageY: number; visits: number; clicks: number }
  >();

  for (const spot of spots) {
    if (getNearestWidth(spot.viewportW) !== bucket.width) continue;

    const scale = bucket.width / Math.max(1, spot.viewportW);
    const pageX = Math.round(spot.pageX * scale);
    const pageY = Math.round(spot.pageY * scale);
    const key = `${pageX}:${pageY}`;
    const existing = merged.get(key);

    if (existing) {
      existing.visits += spot.visits;
      existing.clicks = Math.max(existing.clicks, spot.clicks);
    } else {
      merged.set(key, { pageX, pageY, visits: spot.visits, clicks: spot.clicks });
    }
  }

  return [...merged.values()];
}

export interface ScrollBand {
  /** Band covers fromPct–toPct of the page height. */
  fromPct: number;
  toPct: number;
  /** Visits that scrolled past the end of this band. */
  reached: number;
  /** reached / all visits in the bucket. */
  ratio: number;
}

const SCROLL_BAND_SIZE = 10;

/**
 * Scroll rows record each visit's deepest scroll (in 10% steps). Turn them into bands showing
 * how many visits made it at least that far down.
 */
export function getScrollBands(
  scroll: HeatmapResult['scroll'] | undefined,
  bucket: ScreenWidthBucket | null,
): ScrollBand[] {
  if (!scroll || !bucket) return [];

  const visitsByDepth = new Map<number, number>();

  for (const row of scroll.buckets) {
    if (getNearestWidth(row.viewportW) !== bucket.width) continue;
    visitsByDepth.set(row.depth, (visitsByDepth.get(row.depth) ?? 0) + row.sessions);
  }

  const total = [...visitsByDepth.values()].reduce((sum, value) => sum + value, 0);
  const bands: ScrollBand[] = [];
  let dropped = 0;

  for (let depth = 0; depth < 100; depth += SCROLL_BAND_SIZE) {
    dropped += visitsByDepth.get(depth) ?? 0;
    const reached = Math.max(0, total - dropped);

    bands.push({
      fromPct: depth,
      toPct: Math.min(100, depth + SCROLL_BAND_SIZE),
      reached,
      ratio: total ? reached / total : 0,
    });
  }

  return bands;
}

/**
 * Height to render the snapshot at. Near single-screen pages use the visitor's viewport height,
 * so layouts sized with 100vh look the same as they did for the visitor.
 */
export function getSnapshotHeight(pageH: number, viewportH: number) {
  return pageH <= viewportH * 1.25 ? viewportH : pageH;
}
