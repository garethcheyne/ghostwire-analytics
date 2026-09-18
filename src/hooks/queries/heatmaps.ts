'use client';
import type { HeatmapMode, HeatmapResult } from '@/queries/sql/heatmap/getHeatmap';
import { useAnalyticsQuery } from './analytics';

export type { HeatmapMode, HeatmapResult };

/**
 * Heatmap data for the current date range and filters. Without a urlPath it returns just the
 * list of pages that have data; with one it adds that page's clicks or scroll depth.
 */
export function useHeatmap(websiteId: string, mode: HeatmapMode, urlPath?: string) {
  return useAnalyticsQuery<HeatmapResult>(websiteId, 'heatmaps', { mode, urlPath });
}
