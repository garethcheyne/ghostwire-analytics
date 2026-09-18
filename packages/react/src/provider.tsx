import { type ReactNode, useEffect, useRef } from 'react';
import { flushQueue, identify, type TrackData } from './tracker';

export interface GhostwireUser extends TrackData {
  /** Stable ID for the user, e.g. their username (up to 50 characters). */
  id: string;
  email?: string;
  name?: string;
}

export interface GhostwireProviderProps {
  /** Your Ghostwire Analytics server, e.g. https://analytics.example.com */
  host: string;
  /** The website's ID, from its settings in Ghostwire. */
  websiteId: string;
  /** Capture uncaught errors and rejected promises (needs error reporting switched on too). */
  errors?: boolean;
  /**
   * The signed-in user, or null/undefined when signed out. Changing it identifies the new
   * user; going from a user to none returns the visitor to anonymous.
   */
  user?: GhostwireUser | null;
  /** Record page views automatically, including client-side route changes. Default true. */
  autoTrack?: boolean;
  /** Only track on these hostnames. */
  domains?: string[];
  /**
   * The deployed version (e.g. a package version or commit SHA). Page views and errors carry it,
   * so Ghostwire can show crash-free sessions and new errors per release.
   */
  release?: string;
  /** Tracker script path on the host, if your server renames it. Default "script.js". */
  scriptName?: string;
  children?: ReactNode;
}

type ScriptOptions = Omit<GhostwireProviderProps, 'user' | 'children' | 'domains'> & {
  domains?: string;
};

function loadScript({
  host,
  websiteId,
  errors,
  autoTrack,
  domains,
  scriptName,
  release,
}: ScriptOptions) {
  // Already on the page (added by this provider before, or by hand in the HTML head).
  const existing = document.querySelector<HTMLScriptElement>(
    // Website IDs are UUIDs; strip anything else so the selector is always valid.
    `script[data-website-id="${websiteId.replace(/[^\w-]/g, '')}"]`,
  );

  if (existing) {
    if (window.ghostwire) flushQueue();
    else existing.addEventListener('load', flushQueue, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.defer = true;
  script.src = `${host.replace(/\/+$/, '')}/${(scriptName ?? 'script.js').replace(/^\/+/, '')}`;
  script.dataset.websiteId = websiteId;
  if (errors) script.dataset.errors = 'true';
  if (autoTrack === false) script.dataset.autoTrack = 'false';
  if (domains) script.dataset.domains = domains;
  if (release) script.dataset.release = release;
  script.addEventListener('load', flushQueue, { once: true });
  document.head.appendChild(script);
}

/**
 * Loads the Ghostwire tracker and keeps the signed-in user identified. Put it near the root of
 * your app. For errors thrown while the page first loads (before React runs), use the script
 * tag in your HTML head instead of, or as well as, this provider.
 */
export function GhostwireProvider({
  host,
  websiteId,
  errors,
  user,
  autoTrack,
  domains,
  scriptName,
  release,
  children,
}: GhostwireProviderProps) {
  const domainList = domains?.join(',');

  useEffect(() => {
    try {
      loadScript({ host, websiteId, errors, autoTrack, domains: domainList, scriptName, release });
    } catch {
      /* never break the app over analytics */
    }
  }, [host, websiteId, errors, autoTrack, domainList, scriptName, release]);

  // Identify on sign-in and on changes to the user's details; go anonymous on sign-out.
  const userKey = user ? JSON.stringify(user) : '';
  const identified = useRef(false);

  useEffect(() => {
    if (userKey) {
      const { id, ...traits } = JSON.parse(userKey) as GhostwireUser;
      identify(id, traits);
      identified.current = true;
    } else if (identified.current) {
      identify('');
      identified.current = false;
    }
  }, [userKey]);

  return <>{children}</>;
}
