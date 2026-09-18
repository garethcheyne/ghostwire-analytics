'use client';
import { ChartPie, UserPlus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSegments } from '@/hooks/queries/segments';
import { useFilters } from '@/hooks/use-filters';
import { OPERATORS } from '@/lib/constants';
import { formatMetricLabel } from './metric-labels';

const FILTER_LABELS: Record<string, string> = {
  path: 'Page',
  referrer: 'Referrer',
  title: 'Title',
  query: 'Query',
  hostname: 'Hostname',
  browser: 'Browser',
  os: 'OS',
  device: 'Device',
  country: 'Country',
  region: 'Region',
  city: 'City',
  language: 'Language',
  event: 'Event',
  tag: 'Tag',
  utmSource: 'UTM source',
  utmMedium: 'UTM medium',
  utmCampaign: 'UTM campaign',
  utmContent: 'UTM content',
  utmTerm: 'UTM term',
  distinctId: 'User ID',
};

const OPERATOR_LABELS: Record<string, string> = {
  [OPERATORS.equals]: 'is',
  [OPERATORS.notEquals]: 'is not',
  [OPERATORS.contains]: 'contains',
  [OPERATORS.doesNotContain]: 'does not contain',
  [OPERATORS.regex]: 'matches',
  [OPERATORS.notRegex]: 'does not match',
};

/** Active URL filters as removable badges. */
export function FilterBar({ websiteId }: { websiteId: string }) {
  const { filters, segment, cohort, removeFilter, clearFilters, setSegment } = useFilters();
  const { data: segments } = useSegments(websiteId, 'segment');
  const { data: cohorts } = useSegments(websiteId, 'cohort');
  const applied = [
    segment && {
      type: 'segment' as const,
      id: segment,
      icon: ChartPie,
      name: segments?.data.find(s => s.id === segment)?.name,
    },
    cohort && {
      type: 'cohort' as const,
      id: cohort,
      icon: UserPlus,
      name: cohorts?.data.find(s => s.id === cohort)?.name,
    },
  ].filter(Boolean) as {
    type: 'segment' | 'cohort';
    id: string;
    icon: typeof ChartPie;
    name?: string;
  }[];

  if (!filters.length && !applied.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {applied.map(item => (
        <Badge key={item.type} className="gap-1 py-1 pr-1 pl-2">
          <item.icon className="size-3" />
          <span className="text-primary-foreground/80">
            {item.type === 'segment' ? 'Segment' : 'Cohort'}
          </span>
          <span className="font-medium">{item.name ?? '…'}</span>
          <button
            type="button"
            onClick={() => setSegment(item.type, null)}
            className="ml-1 rounded-sm p-0.5 hover:bg-background/20"
            aria-label={`Remove ${item.type}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {filters.map(filter => (
        <Badge key={filter.key} variant="secondary" className="gap-1 py-1 pr-1 pl-2">
          <span className="text-muted-foreground">{FILTER_LABELS[filter.name] ?? filter.name}</span>
          <span className="text-muted-foreground">
            {OPERATOR_LABELS[filter.operator] ?? filter.operator}
          </span>
          <span className="font-medium">
            {filter.value
              .split(',')
              .map(value => formatMetricLabel(filter.name, value))
              .join(', ')}
          </span>
          <button
            type="button"
            onClick={() => removeFilter(filter.key)}
            className="ml-1 rounded-sm p-0.5 hover:bg-background/60"
            aria-label={`Remove ${FILTER_LABELS[filter.name] ?? filter.name} filter`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {filters.length + applied.length > 1 && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear all
        </Button>
      )}
    </div>
  );
}
