/**
 * Web Vitals for seeded page views (Ghostwire addition to Umami's generator), so the
 * Performance report has data. Mobile devices get slower, more variable numbers.
 */
import { addSeconds, uuid } from '../utils.js';
import type { EventData } from './events.js';

const PERFORMANCE_EVENT_TYPE = 5;
const SAMPLE_RATE = 0.3;

// Log-normal-ish sample around a median, clamped to a sane range.
function sample(median: number, spread: number, min: number, max: number) {
  const gaussian =
    Math.sqrt(-2 * Math.log(Math.random() || 1e-9)) * Math.cos(2 * Math.PI * Math.random());
  return Math.min(max, Math.max(min, median * Math.exp(gaussian * spread)));
}

export function maybePerformanceEvent(pageview: EventData, device: string): EventData | null {
  if (Math.random() > SAMPLE_RATE) {
    return null;
  }

  const slow = device === 'mobile' ? 1.6 : device === 'tablet' ? 1.3 : 1;

  return {
    ...pageview,
    id: uuid(),
    eventType: PERFORMANCE_EVENT_TYPE,
    referrerDomain: null,
    referrerPath: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    gclid: null,
    fbclid: null,
    eventName: null,
    createdAt: addSeconds(pageview.createdAt, 2),
    lcp: Math.round(sample(1900 * slow, 0.45, 300, 12000)),
    inp: Math.round(sample(140 * slow, 0.6, 16, 2000)),
    cls: Number(sample(0.06, 0.9, 0, 1).toFixed(4)),
    fcp: Math.round(sample(1200 * slow, 0.4, 200, 8000)),
    ttfb: Math.round(sample(450 * slow, 0.5, 50, 4000)),
  };
}
