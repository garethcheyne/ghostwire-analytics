import { describe, expect, it } from 'vitest';
import {
  getBreakpoint,
  getBucketPoints,
  getBucketSpots,
  getBusiestBucket,
  getNearestWidth,
  getScreenWidthBuckets,
  getScrollBands,
  getSnapshotHeight,
} from './heatmap';

const point = (viewportW: number, pageX: number, pageY: number, count = 1) => ({
  x: pageX,
  y: pageY,
  pageX,
  pageY,
  pageW: viewportW,
  pageH: 3000,
  viewportW,
  viewportH: 900,
  count,
});

describe('getBreakpoint', () => {
  it('uses mobile < 768, tablet < 1024, desktop otherwise', () => {
    expect(getBreakpoint(375)).toBe('mobile');
    expect(getBreakpoint(767)).toBe('mobile');
    expect(getBreakpoint(768)).toBe('tablet');
    expect(getBreakpoint(1023)).toBe('tablet');
    expect(getBreakpoint(1024)).toBe('desktop');
  });
});

describe('getNearestWidth', () => {
  it('snaps to the closest standard width', () => {
    expect(getNearestWidth(390)).toBe(375);
    expect(getNearestWidth(1366)).toBe(1440);
    expect(getNearestWidth(2560)).toBe(1920);
  });
});

describe('getScreenWidthBuckets', () => {
  it('groups by nearest width, in width order, counting clicks', () => {
    const buckets = getScreenWidthBuckets([
      point(1440, 10, 10, 3),
      point(375, 5, 5),
      point(1366, 20, 20, 2),
    ]);

    expect(buckets.map(b => [b.width, b.count, b.positions])).toEqual([
      [375, 1, 1],
      [1440, 5, 2],
    ]);
    expect(buckets[1].minViewportW).toBe(1366);
    expect(buckets[1].maxViewportW).toBe(1440);
  });

  it('never makes a page shorter than 640px', () => {
    const [bucket] = getScreenWidthBuckets([{ ...point(1440, 0, 0), pageH: 300, viewportH: 300 }]);
    expect(bucket.pageH).toBe(640);
  });

  it('picks the busiest bucket by count', () => {
    const buckets = getScreenWidthBuckets([point(1440, 1, 1, 2), point(375, 1, 1, 9)]);
    expect(getBusiestBucket(buckets)?.width).toBe(375);
    expect(getBusiestBucket([])).toBeNull();
  });
});

describe('getBucketPoints', () => {
  it('scales points to the bucket width and merges identical positions', () => {
    const points = [
      point(1440, 100, 50),
      point(1440, 100, 50, 2),
      point(720, 50, 25),
      point(375, 1, 1),
    ];
    const [bucket] = getScreenWidthBuckets(points.filter(p => p.viewportW === 1440));

    // 720 snaps to 768, so only the two 1440 points are in the 1440 bucket.
    expect(getBucketPoints(points, bucket)).toEqual([{ pageX: 100, pageY: 50, count: 3 }]);
  });
});

describe('getBucketSpots', () => {
  it('keeps spots in the bucket, scales them, and merges visits at the same place', () => {
    const spot = (viewportW: number, pageX: number, visits: number, clicks: number) => ({
      pageX,
      pageY: 100,
      pageW: viewportW,
      pageH: 2000,
      viewportW,
      viewportH: 900,
      visits,
      clicks,
    });
    const [bucket] = getScreenWidthBuckets([point(1440, 0, 0)]);

    expect(
      getBucketSpots([spot(1440, 50, 2, 3), spot(1440, 50, 1, 5), spot(375, 5, 9, 9)], bucket),
    ).toEqual([{ pageX: 50, pageY: 100, visits: 3, clicks: 5 }]);
  });
});

describe('getScrollBands', () => {
  const scroll = (rows: [depth: number, visits: number][]) => ({
    buckets: rows.map(([depth, sessions]) => ({
      depth,
      sessions,
      pageW: 1440,
      pageH: 4000,
      viewportW: 1440,
      viewportH: 900,
    })),
    totalSessions: 0,
    pageW: null,
    pageH: null,
    viewportW: null,
    viewportH: null,
  });

  it('counts visits that scrolled past each 10% band', () => {
    const data = scroll([
      [20, 1],
      [50, 2],
      [100, 1],
    ]);
    const [bucket] = getScreenWidthBuckets(
      data.buckets.map(b => ({ ...b, count: b.sessions })),
      'weightedAverage',
    );
    const bands = getScrollBands(data, bucket);

    expect(bands).toHaveLength(10);
    expect(bands.map(b => b.reached)).toEqual([4, 4, 3, 3, 3, 1, 1, 1, 1, 1]);
    expect(bands[0].ratio).toBe(1);
    expect(bands[9]).toMatchObject({ fromPct: 90, toPct: 100, ratio: 0.25 });
  });

  it('returns nothing without a bucket', () => {
    expect(getScrollBands(scroll([[10, 1]]), null)).toEqual([]);
  });
});

describe('getSnapshotHeight', () => {
  it('uses the viewport height for near single-screen pages', () => {
    expect(getSnapshotHeight(1000, 900)).toBe(900);
    expect(getSnapshotHeight(3000, 900)).toBe(3000);
  });
});
