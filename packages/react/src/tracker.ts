/*
 * Talks to the Ghostwire tracker script (window.ghostwire). Calls made before the script has
 * loaded are queued and run once it's ready. Nothing here ever throws into the app.
 */

export type TrackData = Record<string, unknown>;

export interface GhostwireTracker {
  track: (name?: string | TrackData, data?: TrackData) => Promise<void>;
  identify: (id: string | TrackData, data?: TrackData) => Promise<void>;
  error: (error: unknown, context?: TrackData) => Promise<void>;
}

declare global {
  interface Window {
    ghostwire?: GhostwireTracker;
  }
}

const queue: ((tracker: GhostwireTracker) => unknown)[] = [];

function run(fn: (tracker: GhostwireTracker) => unknown, tracker: GhostwireTracker) {
  try {
    const result = fn(tracker);
    // Tracker calls return promises; a rejection must not become an unhandled rejection.
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    /* never throw into the app */
  }
}

/** Runs fn with the tracker now, or queues it until the tracker script has loaded. */
export function withTracker(fn: (tracker: GhostwireTracker) => unknown) {
  if (typeof window === 'undefined') return;

  const tracker = window.ghostwire;
  if (tracker) run(fn, tracker);
  else queue.push(fn);
}

/** Runs queued calls. Called when the tracker script has loaded. */
export function flushQueue() {
  const tracker = typeof window === 'undefined' ? undefined : window.ghostwire;
  if (!tracker) return;

  while (queue.length) run(queue.shift()!, tracker);
}

/** Record a custom event (or, with no arguments, a page view). */
export function track(name?: string, data?: TrackData) {
  withTracker(tracker => tracker.track(name, data));
}

/** Link this visitor to your user, e.g. their username. Pass '' to go back to anonymous. */
export function identify(id: string, data?: TrackData) {
  withTracker(tracker => tracker.identify(id, data));
}

/**
 * Report an error you caught. It still needs error reporting switched on for the website.
 * Reporting only observes: it doesn't rethrow, log or otherwise change the error.
 */
export function reportError(error: unknown, context?: TrackData) {
  withTracker(tracker => tracker.error(error, context));
}

/** Test helper: forget queued calls. */
export function resetQueue() {
  queue.length = 0;
}
