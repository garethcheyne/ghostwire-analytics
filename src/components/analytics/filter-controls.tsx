'use client';
import { ChartPie, ListFilter, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSegments } from '@/hooks/queries/segments';
import { useFilters } from '@/hooks/use-filters';
import { type FilterRow, FilterRows, emptyFilter } from './filter-rows';
import { useShare } from '@/components/share/share-context';

function AddFilterButton() {
  const { addFilter } = useFilters();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FilterRow[]>([emptyFilter()]);

  return (
    <Popover
      open={open}
      onOpenChange={value => {
        setOpen(value);
        if (value) setRows([emptyFilter()]);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline">
          <ListFilter data-icon="inline-start" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[36rem] max-w-[calc(100vw-2rem)]">
        <form
          className="flex flex-col gap-3"
          onSubmit={event => {
            event.preventDefault();
            rows
              .filter(row => row.value.trim())
              .forEach(row => addFilter(row.name, row.value.trim(), row.operator));
            setOpen(false);
          }}
        >
          <p className="text-sm font-medium">Add filters</p>
          <FilterRows rows={rows} onChange={setRows} allowEmpty={false} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function SegmentPicker({ websiteId }: { websiteId: string }) {
  const { segment, cohort, setSegment } = useFilters();
  const { data: segments } = useSegments(websiteId, 'segment');
  const { data: cohorts } = useSegments(websiteId, 'cohort');

  if (!segments?.data.length && !cohorts?.data.length) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={segment || cohort ? 'secondary' : 'outline'}>
          <ChartPie data-icon="inline-start" />
          Segment
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {!!segments?.data.length && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>Segments</DropdownMenuLabel>
            {segments.data.map(item => (
              <DropdownMenuItem key={item.id} onSelect={() => setSegment('segment', item.id)}>
                <ChartPie />
                {item.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
        {!!cohorts?.data.length && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Cohorts</DropdownMenuLabel>
              {cohorts.data.map(item => (
                <DropdownMenuItem key={item.id} onSelect={() => setSegment('cohort', item.id)}>
                  <UserPlus />
                  {item.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Filter and segment buttons for the website header. */
export function FilterControls({ websiteId }: { websiteId: string }) {
  const share = useShare();

  if (share) {
    return share.allowFilter ? <AddFilterButton /> : null;
  }

  return (
    <>
      <SegmentPicker websiteId={websiteId} />
      <AddFilterButton />
    </>
  );
}
