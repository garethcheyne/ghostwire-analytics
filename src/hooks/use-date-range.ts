'use client';
import { fromZonedTime } from 'date-fns-tz';
import { useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { DEFAULT_DATE_RANGE_VALUE } from '@/lib/constants';
import { getOffsetDateRange, parseDateRange } from '@/lib/date';
import { useTimezone } from './use-timezone';

/**
 * The selected date range, from the URL (?date=7day | range:start:end[:all], &unit, &offset,
 * &compare), computed in the viewer's timezone like Umami's useDateRange/useDateParameters.
 */
export function useDateRange() {
  const searchParams = useSearchParams();
  const timezone = useTimezone();
  const date = searchParams.get('date') || DEFAULT_DATE_RANGE_VALUE;
  const unit = searchParams.get('unit') || '';
  const offset = Number(searchParams.get('offset') || 0);
  const compare = searchParams.get('compare') || 'prev';

  return useMemo(() => {
    const parsed =
      parseDateRange(date, unit, 'en-US', timezone) ??
      parseDateRange(DEFAULT_DATE_RANGE_VALUE, unit, 'en-US', timezone)!;
    const range = offset ? getOffsetDateRange(parsed, offset) : parsed;

    return {
      date,
      offset,
      compare,
      timezone,
      isAllTime: date.endsWith(':all'),
      isCustomRange: date.startsWith('range:'),
      // Dates in the viewer's timezone (for display and chart buckets).
      startDate: range.startDate,
      endDate: range.endDate,
      unit: range.unit ?? 'day',
      // Query parameters for the API: UTC epoch milliseconds.
      params: {
        startAt: +fromZonedTime(range.startDate, timezone),
        endAt: +fromZonedTime(range.endDate, timezone),
        unit: range.unit ?? 'day',
        timezone,
      },
    };
  }, [date, unit, offset, compare, timezone]);
}
