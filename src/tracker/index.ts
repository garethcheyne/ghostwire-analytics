/** Public types for the browser tracker. */
export type TrackedProperties = {
  /**
   * Hostname of server
   *
   * @description extracted from `window.location.hostname`
   * @example 'analytics.example.com'
   */
  hostname?: string;

  /** Distinct ID associated with the current visitor. */
  id?: string;

  /**
   * Browser language
   *
   * @description extracted from `window.navigator.language`
   * @example 'en-US', 'fr-FR'
   */
  language?: string;

  /**
   * Page referrer
   *
   * @description extracted from `document.referrer`
   * @example 'https://example.com/docs/getting-started'
   */
  referrer?: string;

  /**
   * Screen dimensions
   *
   * @description extracted from `window.screen.width` and `window.screen.height`
   * @example '1920x1080', '2560x1440'
   */
  screen?: string;

  /** Tag configured on the tracker script. */
  tag?: string;

  /**
   * Page title
   *
   * @description extracted from `document.querySelector('head > title')`
   * @example 'ghostwire'
   */
  title?: string;

  /**
   * Page url
   *
   * @description normalized from `window.location.href`
   * @example 'https://example.com/docs/getting-started'
   */
  url?: string;

  /**
   * Website ID (required)
   *
   * @example 'b59e9c65-ae32-47f1-8400-119fcf4861c4'
   */
  website: string;
};

export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type EventDataValue = boolean | number | string | null | EventData | EventDataValue[];

/**
 *
 * Event Data can work with any JSON data. There are a few rules in place to maintain performance.
 * - Numbers have a max precision of 4.
 * - Strings have a max length of 500.
 * - Arrays are converted to a String, with the same max length of 500.
 * - Objects have a max of 50 properties. Arrays are considered 1 property.
 */
export interface EventData {
  [key: string]: EventDataValue;
}

export type EventProperties = {
  /**
   * NOTE: event names will be truncated past 50 characters
   */
  name: string;
  data?: EventData;
} & WithRequired<TrackedProperties, 'website'>;
export type PageViewProperties = WithRequired<TrackedProperties, 'website'>;
export type CustomEventFunction = (
  props: PageViewProperties,
) => EventProperties | PageViewProperties;

export type GhostwireTracker = {
  track: {
    /**
     * Track a page view
     *
     * @example ```
     * ghostwire.track();
     * ```
     */
    (): Promise<void>;

    /**
     * Track an event with a given name
     *
     * NOTE: event names will be truncated past 50 characters
     *
     * @example ```
     * ghostwire.track('signup-button');
     * ```
     */
    (eventName: string): Promise<void>;

    /**
     * Tracks an event with dynamic data.
     *
     * NOTE: event names will be truncated past 50 characters
     *
     * When tracking events, the default properties are included in the payload. This is equivalent to running:
     *
     * ```js
     * ghostwire.track(props => ({
     *   ...props,
     *   name: 'signup-button',
     *   data: {
     *     name: 'newsletter',
     *     id: 123
     *   }
     * }));
     * ```
     *
     * @example ```
     * ghostwire.track('signup-button', { name: 'newsletter', id: 123 });
     * ```
     */
    (eventName: string, obj: EventData): Promise<void>;

    /**
     * Tracks a page view with custom properties
     *
     * @example ```
     * ghostwire.track({ website: 'e676c9b4-11e4-4ef1-a4d7-87001773e9f2', url: '/home', title: 'Home page' });
     * ```
     */
    (properties: PageViewProperties): Promise<void>;

    /**
     * Tracks an event with fully customizable dynamic data
     * If you don't specify any `name` and/or `data`, it will be treated as a page view
     *
     * @example ```
     * ghostwire.track((props) => ({ ...props, url: path }));
     * ```
     */
    (eventFunction: CustomEventFunction): Promise<void>;
  };
  identify: {
    /**
     * Identify a visitor with optional associated data.
     *
     * @example ```
     * ghostwire.identify('user-123', { plan: 'pro' });
     * ```
     */
    (id: string, data?: EventData): Promise<void>;

    /**
     * Associate data with the current visitor. An `id` string sets the Distinct ID.
     *
     * @example ```
     * ghostwire.identify({ id: 'user-123', plan: 'pro' });
     * ```
     */
    (data: EventData & { id?: string }): Promise<void>;
  };
  /**
   * Report an error you caught yourself. Needs error reporting switched on for the website.
   *
   * @example ```
   * try { await pay(); } catch (e) { ghostwire.error(e, { orderId }); }
   * ```
   */
  error: (error: unknown, context?: EventData) => Promise<void>;
  getSession: () => {
    cache: string | undefined;
    website: string | null;
  };
};

declare global {
  interface Window {
    ghostwire: GhostwireTracker;
  }
}

type Payload = Record<string, unknown>;
type BeforeSend = (
  type: string,
  payload: Payload,
) => Payload | null | undefined | Promise<Payload | null | undefined>;
type TrackerWindow = Window &
  typeof globalThis & {
    doNotTrack?: string | number | null;
    navigator: Navigator & {
      msDoNotTrack?: string | number | null;
    };
  };
type TrackerDocument = Document & {
  currentScript: HTMLScriptElement | null;
};
type MetricEntry = PerformanceEntry & {
  activationStart: number;
  duration: number;
  hadRecentInput: boolean;
  interactionId: number;
  responseStart: number;
  startTime: number;
  value: number;
};
(window => {
  const {
    screen: { width, height },
    navigator: { language, doNotTrack: ndnt, msDoNotTrack: msdnt },
    location,
    document,
    history,
    top,
    doNotTrack,
  } = window;
  const { currentScript, referrer } = document as TrackerDocument;
  if (!currentScript) return;

  const { hostname, href, origin } = location;

  let localStorage: Storage | undefined;
  try {
    localStorage = href.startsWith('data:') ? undefined : window.localStorage;
  } catch {
    /* (DOMException) SecurityError: Access is denied for this document. */
  }

  const _data = 'data-';
  const _false = 'false';
  const _true = 'true';
  const attr = currentScript.getAttribute.bind(currentScript);
  const config = (value: string) => attr(`${_data}${value}`);

  const website = config('website-id');
  const hostUrl = config('host-url');
  const beforeSend = config('before-send');
  const distinctId = config('distinct-id') || undefined;
  const tag = config('tag') || undefined;
  // The site's deployed version, e.g. data-release="2.4.1" or a commit SHA.
  const release = config('release') || undefined;
  const autoTrack = config('auto-track') !== _false;
  const dnt = config('do-not-track') === _true;
  const excludeSearch = config('exclude-search') === _true;
  const excludeHash = config('exclude-hash') === _true;
  const domain = config('domains') || '';
  const credentials = (config('fetch-credentials') || 'omit') as RequestCredentials;
  const perf = config('performance') === _true;
  const autoPageview = config('auto-pageview') !== _false;
  const captureErrors = config('errors') === _true;

  const domains = domain.split(',').map(n => n.trim());
  const host =
    hostUrl || '__COLLECT_API_HOST__' || currentScript.src.split('/').slice(0, -1).join('/');
  const endpoint = `${host.replace(/\/$/, '')}__COLLECT_API_ENDPOINT__`;
  const screen = `${width}x${height}`;
  const eventRegex = /data-ghostwire-event-([\w-_]+)/;
  const eventNameAttribute = `${_data}ghostwire-event`;
  const delayDuration = 300;

  /* Helper functions */

  const normalize = (raw: string | URL): string => {
    if (!raw) return raw as string;
    try {
      const u = new URL(raw, location.href);
      if (excludeSearch) u.search = '';
      if (excludeHash) u.hash = '';
      return u.toString();
    } catch {
      return raw as string;
    }
  };

  // Strip the origin from same-origin referrers so the referrer domain
  // is never saved when it matches the current hostname
  const stripOrigin = (url: string): string =>
    url === origin || url?.startsWith(origin + '/') ? url.slice(origin.length) : url;

  const getPayload = () => ({
    website,
    screen,
    language,
    title: document.title,
    hostname,
    url: currentUrl,
    referrer: stripOrigin(currentRef),
    tag,
    release,
    id: identity ? identity : undefined,
  });

  const hasDoNotTrack = () => {
    const dnt = doNotTrack || ndnt || msdnt;
    return dnt === 1 || dnt === '1' || dnt === 'yes';
  };

  /* Event handlers */

  const handlePush = (_state: unknown, _title: string, url?: string | URL | null) => {
    if (!url) return;

    if (typeof flushPerformance === 'function') {
      flushPerformance();
    }

    currentRef = currentUrl;
    currentUrl = normalize(url);

    if (currentUrl !== currentRef && autoPageview) {
      setTimeout(track, delayDuration);
    }
  };

  const handlePathChanges = () => {
    const hook = (
      _this: History,
      method: 'pushState' | 'replaceState',
      callback: typeof handlePush,
    ) => {
      const orig = _this[method];
      return (...args: Parameters<History['pushState']>) => {
        const result = orig.apply(_this, args);
        callback(...args);
        return result;
      };
    };

    history.pushState = hook(history, 'pushState', handlePush);
    history.replaceState = hook(history, 'replaceState', handlePush);
  };

  const handleClicks = () => {
    const trackElement = async (el: Element) => {
      const eventName = el.getAttribute(eventNameAttribute);
      if (eventName) {
        const eventData: EventData = {};

        el.getAttributeNames().forEach(name => {
          const match = name.match(eventRegex);
          if (match) eventData[match[1]] = el.getAttribute(name) as string;
        });

        return track(eventName, eventData);
      }
    };
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element;
      const eventEl = el.closest(`[${eventNameAttribute}]`);
      if (!eventEl) return;

      if (eventEl.tagName === 'A' && (eventEl as HTMLAnchorElement).href) {
        const { href, target } = eventEl as HTMLAnchorElement;
        const external =
          target === '_blank' ||
          e.ctrlKey ||
          e.shiftKey ||
          e.metaKey ||
          (e.button && e.button === 1);
        if (!external) e.preventDefault();
        return trackElement(eventEl).finally(() => {
          if (!external) {
            (target === '_top' ? (top as WindowProxy).location : location).href = href;
          }
        });
      }

      return trackElement(eventEl);
    };
    document.addEventListener('click', onClick, true);
  };

  /* Tracking functions */

  const HEATMAP_FRAME_NAME = 'ghostwire-heatmap';

  const trackingDisabled = () =>
    disabled ||
    !website ||
    localStorage?.getItem('ghostwire.disabled') ||
    // The page is being shown inside Ghostwire's heatmap viewer, not visited.
    window.name === HEATMAP_FRAME_NAME ||
    (domain && !domains.includes(hostname)) ||
    (dnt && hasDoNotTrack());

  const send = async (payload: Payload | null | undefined, type = 'event'): Promise<void> => {
    if (trackingDisabled()) return;

    const callback = (window as unknown as Record<string, unknown>)[beforeSend as string] as
      BeforeSend | undefined;

    if (typeof callback === 'function') {
      payload = await Promise.resolve(callback(type, payload as Payload));
    }

    if (!payload) return;

    if (type === 'event') {
      // Page views and events double as breadcrumbs for error reports.
      addBreadcrumb(
        payload.name ? 'event' : 'navigation',
        String(payload.name ?? payload.url ?? ''),
      );
    }

    try {
      const res = await fetch(endpoint, {
        keepalive: true,
        method: 'POST',
        body: JSON.stringify({ type, payload }),
        headers: {
          'Content-Type': 'application/json',
          'x-ghostwire-website-id': website as string,
          'x-ghostwire-hostname': hostname,
          ...(typeof cache !== 'undefined' && { 'x-ghostwire-cache': cache }),
        },
        credentials,
      });

      // Errors (e.g. 429 when rate limited) keep the current session token.
      const data = res.ok
        ? ((await res.json()) as { cache?: string; disabled?: boolean } | null)
        : null;
      if (data) {
        disabled = !!data.disabled;
        cache = data.cache;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      /* no-op */
    }
  };

  const init = () => {
    if (!initialized) {
      initialized = true;
      if (autoPageview) track();
      handlePathChanges();
      handleClicks();
      if (perf) initPerformance();
    }
  };

  const track = (
    name?: string | Payload | ((payload: Payload) => Payload),
    data?: EventData,
  ): Promise<void> => {
    if (typeof name === 'string') return send({ ...getPayload(), name, data });
    if (typeof name === 'object') return send({ ...name });
    if (typeof name === 'function') return send(name(getPayload()));
    return send(getPayload());
  };

  const identify = (
    id: string | (EventData & { id?: string }),
    data?: EventData,
  ): Promise<void> => {
    const nextIdentity = typeof id === 'string' ? id : id.id;

    if (nextIdentity !== undefined) {
      identity = nextIdentity;
    }

    cache = '';
    return send(
      {
        ...getPayload(),
        data: typeof id === 'object' ? id : data,
      },
      'identify',
    );
  };

  /* Performance */

  const initPerformance = () => {
    const metrics: Record<string, number> = {};
    let sent = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let isInitialLoad = true;
    let activationStart = 0;
    let pageStartTime = 0;

    const observe = (type: string, callback: (entry: MetricEntry) => void) => {
      try {
        const observer = new PerformanceObserver(list => {
          (list.getEntries() as MetricEntry[]).forEach(callback);
        });
        observer.observe({ type, buffered: true });
      } catch {
        /* not supported */
      }
    };

    // TTFB
    observe('navigation', entry => {
      activationStart = entry.activationStart || 0;
      metrics.ttfb = Math.max(entry.responseStart - activationStart, 0);
    });

    // FCP
    observe('paint', entry => {
      if (entry.name === 'first-contentful-paint') {
        metrics.fcp = Math.max(entry.startTime - activationStart, 0);
      }
    });

    // LCP
    observe('largest-contentful-paint', entry => {
      metrics.lcp = Math.max(entry.startTime - activationStart, 0);
    });

    // CLS - session windows algorithm (gap < 1s, max 5s duration; report worst window)
    let clsSessionValue = 0;
    let clsSessionEntries: MetricEntry[] = [];
    observe('layout-shift', entry => {
      if (!entry.hadRecentInput) {
        const lastEntry = clsSessionEntries[clsSessionEntries.length - 1];
        const firstEntry = clsSessionEntries[0];
        if (
          lastEntry &&
          entry.startTime - lastEntry.startTime - lastEntry.duration < 1000 &&
          entry.startTime - firstEntry.startTime < 5000
        ) {
          clsSessionValue += entry.value;
          clsSessionEntries.push(entry);
        } else {
          clsSessionValue = entry.value;
          clsSessionEntries = [entry];
        }
        if (clsSessionValue > (metrics.cls || 0)) {
          metrics.cls = clsSessionValue;
        }
      }
    });

    // INP - group by interactionId, 98th percentile, 40ms threshold
    let interactions: Record<number, number> = {};
    let inpObserver: PerformanceObserver | undefined;
    const recordInteractions = (entries: PerformanceEntryList) => {
      (entries as MetricEntry[]).forEach(entry => {
        if (entry.interactionId) {
          const existing = interactions[entry.interactionId];
          if (!existing || entry.duration > existing) {
            interactions[entry.interactionId] = entry.duration;
          }
        }
      });
    };
    try {
      inpObserver = new PerformanceObserver(list => recordInteractions(list.getEntries()));
      inpObserver.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 40,
      } as PerformanceObserverInit);
    } catch {
      /* not supported */
    }

    const computeInp = () => {
      if (inpObserver) recordInteractions(inpObserver.takeRecords());
      const values = Object.values(interactions).sort((a, b) => b - a);
      if (values.length) {
        const p98Index = Math.floor(Math.max(values.length, 10) * 0.02);
        metrics.inp = values[Math.min(p98Index, values.length - 1)];
      }
    };

    const getEntriesByType = (type: string): MetricEntry[] => {
      try {
        return (window.performance?.getEntriesByType?.(type) as MetricEntry[]) || [];
      } catch {
        return [];
      }
    };

    const applyFallbackMetrics = () => {
      if (!isInitialLoad) return;

      if (metrics.ttfb === undefined) {
        const navigation = getEntriesByType('navigation')?.[0];
        if (navigation) {
          metrics.ttfb = Math.max(navigation.responseStart - (navigation.activationStart || 0), 0);
        }
      }

      if (metrics.fcp === undefined) {
        const fcpEntry = getEntriesByType('paint')?.find(
          entry => entry.name === 'first-contentful-paint',
        );
        if (fcpEntry) {
          metrics.fcp = Math.max(fcpEntry.startTime - activationStart, 0);
        }
      }

      if (metrics.lcp === undefined) {
        const lcpEntries = getEntriesByType('largest-contentful-paint');
        const lcpEntry = lcpEntries?.[lcpEntries.length - 1];
        if (lcpEntry) {
          metrics.lcp = Math.max(lcpEntry.startTime - activationStart, 0);
        }
      }
    };

    const sendPerformance = () => {
      if (sent) return;

      applyFallbackMetrics();
      computeInp();
      metrics.duration = Math.round(performance.now() - pageStartTime);

      sent = true;
      if (timeoutId) clearTimeout(timeoutId);
      send({ ...getPayload(), ...metrics }, 'performance');
    };

    flushPerformance = () => {
      sendPerformance();
      isInitialLoad = false;
      Object.keys(metrics).forEach(k => {
        delete metrics[k];
      });
      activationStart = 0;
      pageStartTime = performance.now();
      clsSessionValue = 0;
      clsSessionEntries = [];
      interactions = {};
      sent = false;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(sendPerformance, 10000);
    };
    timeoutId = setTimeout(sendPerformance, 10000);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') sendPerformance();
    });
    window.addEventListener('pagehide', sendPerformance);
  };

  /* Errors */

  // Error capture only observes. It never wraps or replaces site code (no fetch/console
  // patching), never cancels an error (the browser still logs it and other handlers still run),
  // and anything that goes wrong inside it is swallowed so it can't add errors of its own.

  type Breadcrumb = { type: string; message: string; timestamp: number };

  const MAX_BREADCRUMBS = 20;
  const MAX_ERRORS_PER_PAGE = 10;
  const REPEAT_WINDOW = 5000;
  const breadcrumbs: Breadcrumb[] = [];
  const lastReported = new Map<string, number>();
  let errorCount = 0;
  let reporting = false;

  function addBreadcrumb(type: string, message: string) {
    breadcrumbs.push({ type, message: message.slice(0, 300), timestamp: Date.now() });
    if (breadcrumbs.length > MAX_BREADCRUMBS) breadcrumbs.shift();
  }

  // Cheap description of a clicked element. Text is read only from small interactive elements,
  // never from containers (reading a container's text on every click can be expensive).
  const describeElement = (target: Element) => {
    const el =
      target.closest('a,button,[role="button"],summary,input,select,textarea,label') ?? target;
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const text =
      el === target && !/^(a|button|label|summary)$/.test(tag)
        ? ''
        : (el.textContent || '').slice(0, 80).trim().replace(/\s+/g, ' ').slice(0, 40);

    return `${tag}${id}${text ? ` "${text}"` : ''}`;
  };

  const toError = (value: unknown): Error => {
    if (value instanceof Error) return value;
    if (typeof value === 'string') return new Error(value);

    let message: string;
    try {
      message = JSON.stringify(value) ?? String(value);
    } catch {
      message = String(value); // circular or otherwise unserializable
    }
    return new Error(message);
  };

  const reportError = (
    error: unknown,
    { handled = false, context }: { handled?: boolean; context?: EventData } = {},
  ): Promise<void> => {
    // An error raised while reporting would otherwise come straight back here.
    if (reporting) return Promise.resolve();
    reporting = true;

    try {
      const err = toError(error);
      const message = err.message || String(err);
      const key = `${err.name}:${message}:${(err.stack || '').slice(0, 200)}`;
      const now = Date.now();

      // Skip repeats of the same error in quick succession, and runaway loops.
      if (errorCount >= MAX_ERRORS_PER_PAGE || now - (lastReported.get(key) ?? 0) < REPEAT_WINDOW) {
        return Promise.resolve();
      }
      lastReported.set(key, now);
      errorCount++;

      return send(
        {
          ...getPayload(),
          error: {
            type: err.name || 'Error',
            message,
            stack: typeof err.stack === 'string' ? err.stack : undefined,
            handled,
            breadcrumbs: breadcrumbs.slice(),
            context,
          },
        },
        'error',
      ).catch(() => {});
    } catch {
      return Promise.resolve();
    } finally {
      reporting = false;
    }
  };

  const safely =
    <T extends unknown[]>(fn: (...args: T) => void) =>
    (...args: T) => {
      try {
        fn(...args);
      } catch {
        /* never let capture code throw into the page */
      }
    };

  const initErrors = () => {
    window.addEventListener(
      'error',
      safely((event: ErrorEvent) => void reportError(event.error ?? event.message)),
    );
    window.addEventListener(
      'unhandledrejection',
      safely((event: PromiseRejectionEvent) => void reportError(event.reason)),
    );
    document.addEventListener(
      'click',
      safely((event: MouseEvent) => {
        if (event.target instanceof Element) addBreadcrumb('click', describeElement(event.target));
      }),
      { capture: true, passive: true },
    );

    // Failed requests become breadcrumbs, read from Resource Timing (no fetch/XHR wrapping).
    // responseStatus is available in Chromium and Firefox; elsewhere requests are just skipped.
    // Query strings are dropped: they can hold tokens.
    try {
      new PerformanceObserver(
        safely((list: PerformanceObserverEntryList) => {
          for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
            const status = (entry as PerformanceResourceTiming & { responseStatus?: number })
              .responseStatus;
            const isRequest =
              entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest';

            if (!isRequest || entry.name.startsWith(endpoint) || !status || status < 400) continue;
            addBreadcrumb('request', `${entry.name.split('?')[0]} ${status}`);
          }
        }),
      ).observe({ type: 'resource', buffered: false });
    } catch {
      /* Resource Timing not supported */
    }
  };

  /* Start */

  if (!window.ghostwire) {
    window.ghostwire = {
      track,
      identify,
      error: (error: unknown, context?: EventData) =>
        reportError(error, { handled: true, context }),
      getSession: () => ({ cache, website }),
    } as GhostwireTracker;
  }

  let currentUrl = normalize(href);
  let currentRef = normalize(referrer);

  let initialized = false;
  let disabled = false;
  let cache: string | undefined;
  let identity = distinctId;
  let flushPerformance: (() => void) | undefined;

  if (distinctId) {
    void identify(distinctId);
  }

  // Inside Ghostwire's heatmap viewer the tracker sends nothing; it only tells the viewer the
  // page loaded and how big it is, so the preview can be sized and the overlay shown.
  if (window.name === HEATMAP_FRAME_NAME && window.parent !== window) {
    const reportSize = () => {
      const { scrollWidth, scrollHeight } = document.documentElement;
      window.parent.postMessage(
        { type: 'ghostwire:heatmap-frame', width: scrollWidth, height: scrollHeight },
        '*',
      );
    };

    reportSize();
    window.addEventListener('load', reportSize);
    setTimeout(reportSize, 1500);
  }

  // Error capture starts right away (not on load), so errors while the page loads are caught.
  if (captureErrors && !trackingDisabled()) {
    initErrors();
  }

  if (autoTrack && !trackingDisabled()) {
    if (document.readyState === 'complete') {
      init();
    } else {
      document.addEventListener('readystatechange', init, true);
    }
  }
})(window as TrackerWindow);
