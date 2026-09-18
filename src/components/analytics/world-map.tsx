'use client';
import { useMemo, useState } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useWebsiteMetrics } from '@/hooks/queries/analytics';
import { useFilters } from '@/hooks/use-filters';
import { ISO_COUNTRIES, MAP_FILE } from '@/lib/constants';
import { formatLongNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatMetricLabel } from './metric-labels';

const COUNTRY_CODES = ISO_COUNTRIES as Record<string, string>;

/** Visitors by country, shaded by share of the top country. Click a country to filter. */
export function WorldMap({
  websiteId,
  data: provided,
  title = 'Map',
}: {
  websiteId: string;
  /** Country rows to show instead of fetching them (e.g. realtime). */
  data?: { x: string | null; y: number }[];
  title?: string;
}) {
  const { data: fetched } = useWebsiteMetrics(websiteId, 'country', 250);
  const data = provided ?? fetched;
  const { addFilter } = useFilters();
  const [hovered, setHovered] = useState<string | null>(null);

  const counts = useMemo(
    () => new Map((data ?? []).filter(row => row.x).map(row => [row.x as string, Number(row.y)])),
    [data],
  );
  const max = Math.max(1, ...counts.values());
  const hoveredCount = hovered ? (counts.get(hovered) ?? 0) : 0;

  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="min-h-5">
          {hovered
            ? `${formatMetricLabel('country', hovered)}: ${formatLongNumber(hoveredCount)} visitors`
            : 'Visitors by country'}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2">
        <ComposableMap projection="geoMercator" height={420} className="h-auto w-full">
          <ZoomableGroup zoom={0.85} minZoom={0.7} center={[0, 35]}>
            <Geographies geography={`${process.env.basePath ?? ''}${MAP_FILE}`}>
              {({ geographies }) =>
                geographies.map(geo => {
                  const code = COUNTRY_CODES[geo.id as string];

                  // Antarctica takes space without adding information.
                  if (code === 'AQ') return null;

                  const count = code ? (counts.get(code) ?? 0) : 0;
                  // Visited countries run from 25% to 100% primary; the rest stay muted.
                  const fill = count
                    ? `color-mix(in oklab, var(--primary) ${25 + Math.round((count / max) * 75)}%, var(--muted))`
                    : 'var(--muted)';

                  return (
                    <Geography
                      key={geo.rsmKey}
                      geography={geo}
                      onMouseEnter={() => setHovered(code ?? null)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => code && count && addFilter('country', code)}
                      style={{ fill, stroke: 'var(--background)', strokeWidth: 0.4, outline: 'none' }}
                      className={cn(
                        'transition-colors',
                        count ? 'cursor-pointer hover:fill-primary!' : 'hover:fill-accent!',
                      )}
                    />
                  );
                })
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </CardContent>
    </Card>
  );
}
