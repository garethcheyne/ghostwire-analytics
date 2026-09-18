'use client';
import { ChartNoAxesColumn, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type MetricRow, useWebsiteMetrics } from '@/hooks/queries/analytics';
import { useFilters } from '@/hooks/use-filters';
import { formatLongNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { countryCode, filterNameFor, formatMetricLabel } from './metric-labels';

export interface MetricTab {
  type: string;
  label: string;
  /** Column header for the value, e.g. "Visitors" or "Views". */
  valueLabel?: string;
}

function MetricRows({
  type,
  rows,
  onSelect,
}: {
  type: string;
  rows: MetricRow[];
  onSelect?: (row: MetricRow) => void;
}) {
  const total = rows.reduce((sum, row) => sum + Number(row.y), 0) || 1;
  const max = Math.max(...rows.map(row => Number(row.y)), 1);

  return (
    <ul className="flex flex-col gap-1">
      {rows.map(row => {
        const label = formatMetricLabel(type, row.x);
        // Cities aren't stored with their country, so only countries and regions get a code.
        const code = type === 'country' || type === 'region' ? countryCode(row.x) : null;
        const share = (Number(row.y) / total) * 100;

        return (
          <li key={`${row.x}`} className="group relative">
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-primary/10 transition-all"
              style={{ width: `${(Number(row.y) / max) * 100}%` }}
              aria-hidden
            />
            <button
              type="button"
              disabled={!onSelect || row.x === null}
              onClick={() => onSelect?.(row)}
              title={onSelect && row.x !== null ? `Filter by ${label}` : undefined}
              className={cn(
                'relative flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm',
                onSelect && row.x !== null && 'hover:bg-muted/60',
              )}
            >
              {code && (
                <span className="w-6 shrink-0 rounded-sm bg-muted text-center font-mono text-[10px] leading-4 text-muted-foreground">
                  {code}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <span className="tabular-nums font-medium">{formatLongNumber(Number(row.y))}</span>
              <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                {Math.round(share)}%
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function AllRowsDialog({
  websiteId,
  tab,
  open,
  onOpenChange,
  onSelect,
}: {
  websiteId: string;
  tab: MetricTab;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (row: MetricRow) => void;
}) {
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const { data, isPending } = useWebsiteMetrics(websiteId, tab.type, 500);
  const rows = (data ?? []).filter(
    row =>
      !deferred ||
      formatMetricLabel(tab.type, row.x).toLowerCase().includes(deferred.toLowerCase()),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{tab.label}</DialogTitle>
          <DialogDescription>Top 500 for the selected period.</DialogDescription>
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search"
            value={search}
            onChange={event => setSearch(event.target.value)}
          />
        </InputGroup>
        <ScrollArea className="h-[60vh] pr-3">
          {isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <MetricRows
              type={tab.type}
              rows={rows}
              onSelect={
                onSelect &&
                (row => {
                  onSelect(row);
                  onOpenChange(false);
                })
              }
            />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** Card with tabs of top-N metrics; clicking a row filters the dashboard by it. */
export function MetricsCard({
  websiteId,
  title,
  tabs,
  limit = 10,
}: {
  websiteId: string;
  title: string;
  tabs: MetricTab[];
  limit?: number;
}) {
  const [active, setActive] = useState(tabs[0].type);
  const [showAll, setShowAll] = useState(false);
  const tab = tabs.find(t => t.type === active) ?? tabs[0];
  const { data, isPending } = useWebsiteMetrics(websiteId, tab.type, limit);
  const { addFilter } = useFilters();
  const filterName = filterNameFor(tab.type);
  const onSelect = filterName
    ? (row: MetricRow) => row.x !== null && addFilter(filterName, row.x)
    : undefined;

  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {tabs.length > 1 && (
          <CardAction>
            <Tabs value={active} onValueChange={setActive}>
              <TabsList>
                {tabs.map(t => (
                  <TabsTrigger key={t.type} value={t.type} className="text-xs">
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <div className="flex justify-between px-2 text-xs text-muted-foreground">
          <span>{tab.label}</span>
          <span className="pr-12">{tab.valueLabel ?? 'Visitors'}</span>
        </div>
        {isPending ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : !data?.length ? (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartNoAxesColumn />
              </EmptyMedia>
              <EmptyDescription>No data for this period.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <MetricRows type={tab.type} rows={data} onSelect={onSelect} />
            {data.length >= limit && (
              <Button variant="ghost" size="sm" className="self-center" onClick={() => setShowAll(true)}>
                View all
              </Button>
            )}
          </>
        )}
      </CardContent>
      {showAll && (
        <AllRowsDialog
          websiteId={websiteId}
          tab={tab}
          open
          onOpenChange={setShowAll}
          onSelect={onSelect}
        />
      )}
    </Card>
  );
}
