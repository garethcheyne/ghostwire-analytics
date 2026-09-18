'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { FILTER_COLUMNS, OPERATORS } from '@/lib/constants';

export interface ActiveFilter {
  /** URL key, e.g. "path" or "browser2" for a second browser filter. */
  key: string;
  name: string;
  operator: string;
  value: string;
}

// Filter values in the URL look like "eq.value" (operator prefix), as in Umami.
function parseValue(raw: string) {
  const match = raw.match(/^([a-z]+)\.(.*)$/);
  const operators = Object.values(OPERATORS) as string[];

  return match && operators.includes(match[1])
    ? { operator: match[1], value: match[2] }
    : { operator: OPERATORS.equals, value: raw };
}

/** Filters from the URL, plus helpers to add/remove them. */
export function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => {
    const result: ActiveFilter[] = [];

    searchParams.forEach((raw, key) => {
      const name = key.replace(/\d+$/, '');

      if (name in FILTER_COLUMNS && !['segment', 'cohort'].includes(name)) {
        result.push({ key, name, ...parseValue(raw) });
      }
    });

    return result;
  }, [searchParams]);

  const segment = searchParams.get('segment');
  const cohort = searchParams.get('cohort');

  // Raw params to forward to the API (filters plus any applied segment/cohort).
  const params = useMemo(
    () => ({
      ...Object.fromEntries(filters.map(({ key, operator, value }) => [key, `${operator}.${value}`])),
      ...(segment && { segment }),
      ...(cohort && { cohort }),
    }),
    [filters, segment, cohort],
  );

  const update = useCallback(
    (change: (params: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams);
      change(next);
      next.delete('page');
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const addFilter = useCallback(
    (name: string, value: string, operator: string = OPERATORS.equals) =>
      update(params => {
        let key = name;
        for (let i = 2; params.has(key); i++) key = `${name}${i}`;
        params.set(key, `${operator}.${value}`);
      }),
    [update],
  );

  const removeFilter = useCallback((key: string) => update(params => params.delete(key)), [update]);

  const clearFilters = useCallback(
    () =>
      update(params => {
        filters.forEach(({ key }) => params.delete(key));
        params.delete('segment');
        params.delete('cohort');
      }),
    [filters, update],
  );

  /** Apply a saved segment or cohort (null clears it). */
  const setSegment = useCallback(
    (type: 'segment' | 'cohort', id: string | null) =>
      update(params => {
        if (id) params.set(type, id);
        else params.delete(type);
      }),
    [update],
  );

  return { filters, params, segment, cohort, addFilter, removeFilter, clearFilters, setSegment };
}
