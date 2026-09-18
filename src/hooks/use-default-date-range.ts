'use client';
import { useSyncExternalStore } from 'react';
import { DATE_RANGE_CONFIG, DEFAULT_DATE_RANGE_VALUE } from '@/lib/constants';

const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(DATE_RANGE_CONFIG) || DEFAULT_DATE_RANGE_VALUE;
  } catch {
    return DEFAULT_DATE_RANGE_VALUE;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The date range pages open with when the URL doesn't say (a saved preference). */
export function useDefaultDateRange() {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_DATE_RANGE_VALUE);
}

export function setDefaultDateRange(value: string | null) {
  try {
    if (value) localStorage.setItem(DATE_RANGE_CONFIG, value);
    else localStorage.removeItem(DATE_RANGE_CONFIG);
  } catch {
    // Storage unavailable; the built-in default is used.
  }

  listeners.forEach(listener => listener());
}
