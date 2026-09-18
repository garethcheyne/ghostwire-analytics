'use client';
import { useSyncExternalStore } from 'react';
import { TIMEZONE_CONFIG } from '@/lib/constants';

const listeners = new Set<() => void>();

function read() {
  try {
    return localStorage.getItem(TIMEZONE_CONFIG) || Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Viewer's reporting timezone: the saved preference, else the browser's. */
export function useTimezone() {
  return useSyncExternalStore(subscribe, read, () => 'UTC');
}

export function setTimezone(timezone: string | null) {
  try {
    if (timezone) {
      localStorage.setItem(TIMEZONE_CONFIG, timezone);
    } else {
      localStorage.removeItem(TIMEZONE_CONFIG);
    }
  } catch {
    // Storage unavailable; the browser timezone is used.
  }

  listeners.forEach(listener => listener());
}
