import { identify, reportError, track } from './tracker';

const api = { track, identify, error: reportError };

/**
 * Tracker functions for components: track(name, data), identify(id, data), error(err, context).
 * Safe to call before the tracker has loaded (calls are queued) and during server rendering
 * (they do nothing).
 */
export function useGhostwire() {
  return api;
}
