'use client';
import { format, isAfter } from 'date-fns';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { DateRange as DayPickerRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWebsiteDateRange } from '@/hooks/queries/analytics';
import { useDateRange } from '@/hooks/use-date-range';
import { getDateRangeValue } from '@/lib/date';

const PRESETS = [
  { value: '0day', label: 'Today' },
  { value: '24hour', label: 'Last 24 hours' },
  { value: '0week', label: 'This week' },
  { value: '7day', label: 'Last 7 days' },
  { value: '0month', label: 'This month' },
  { value: '30day', label: 'Last 30 days' },
  { value: '90day', label: 'Last 90 days' },
  { value: '0year', label: 'This year' },
  { value: '6month', label: 'Last 6 months' },
  { value: '12month', label: 'Last 12 months' },
];

function rangeLabel(start: Date, end: Date) {
  const sameYear = start.getFullYear() === end.getFullYear();

  return `${format(start, sameYear ? 'd MMM' : 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
}

export function DateRangePicker({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { date, offset, startDate, endDate, isAllTime, isCustomRange } = useDateRange();
  const { data: websiteRange } = useWebsiteDateRange(websiteId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState<DayPickerRange | undefined>();

  function navigate(changes: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }

    next.delete('page');
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function selectPreset(value: string) {
    if (value === 'custom') {
      setDraft({ from: startDate, to: endDate });
      setPickerOpen(true);
      return;
    }

    if (value === 'all') {
      if (websiteRange?.startDate && websiteRange.endDate) {
        const value = getDateRangeValue(
          new Date(websiteRange.startDate),
          new Date(websiteRange.endDate),
        );
        navigate({ date: `${value}:all`, offset: null, unit: null });
      }
      return;
    }

    navigate({ date: value, offset: null, unit: null });
  }

  const presetValue = isAllTime
    ? 'all'
    : isCustomRange || offset
      ? 'custom'
      : PRESETS.some(preset => preset.value === date)
        ? date
        : 'custom';
  const canStep = !isAllTime && !isCustomRange;

  return (
    <div className="flex items-center gap-2">
      {canStep && (
        <ButtonGroup>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous period"
            onClick={() => navigate({ offset: String(offset - 1) })}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next period"
            disabled={isAfter(endDate, new Date())}
            onClick={() => navigate({ offset: offset + 1 === 0 ? null : String(offset + 1) })}
          >
            <ChevronRight />
          </Button>
        </ButtonGroup>
      )}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <Select value={presetValue} onValueChange={selectPreset}>
          <PopoverTrigger asChild>
            <SelectTrigger className="min-w-48">
              {presetValue === 'custom' || presetValue === 'all' ? (
                <span className="flex items-center gap-2">
                  <CalendarDays />
                  {presetValue === 'all' ? 'All time' : rangeLabel(startDate, endDate)}
                </span>
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
          </PopoverTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {PRESETS.map(preset => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              {websiteRange?.startDate && <SelectItem value="all">All time</SelectItem>}
              <SelectItem value="custom">Custom range…</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="range"
            numberOfMonths={2}
            selected={draft}
            onSelect={setDraft}
            disabled={{ after: new Date() }}
            defaultMonth={draft?.from}
          />
          <div className="flex justify-end gap-2 border-t p-3">
            <Button variant="outline" size="sm" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!draft?.from || !draft?.to}
              onClick={() => {
                if (!draft?.from || !draft?.to) return;
                const end = new Date(draft.to);
                end.setHours(23, 59, 59, 999);
                navigate({ date: getDateRangeValue(draft.from, end), offset: null, unit: null });
                setPickerOpen(false);
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
