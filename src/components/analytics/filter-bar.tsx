'use client';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
export function FilterBar() {
  const { filters, removeFilter, clearFilters } = useFilters();

  if (!filters.length) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map(filter => (
        <Badge key={filter.key} variant="secondary" className="gap-1 py-1 pr-1 pl-2">
          <span className="text-muted-foreground">{FILTER_LABELS[filter.name] ?? filter.name}</span>
          <span className="text-muted-foreground">{OPERATOR_LABELS[filter.operator] ?? filter.operator}</span>
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
      {filters.length > 1 && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear all
        </Button>
      )}
    </div>
  );
}
