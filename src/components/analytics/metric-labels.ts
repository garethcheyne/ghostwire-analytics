/** Display names for metric values (country codes, channels, devices...). */

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

const CHANNELS: Record<string, string> = {
  direct: 'Direct',
  referral: 'Referral',
  email: 'Email',
  sms: 'SMS',
  paidAds: 'Paid ads',
  organicSearch: 'Organic search',
  paidSearch: 'Paid search',
  organicSocial: 'Organic social',
  paidSocial: 'Paid social',
  organicShopping: 'Organic shopping',
  paidShopping: 'Paid shopping',
  organicVideo: 'Organic video',
  paidVideo: 'Paid video',
};

const BROWSERS: Record<string, string> = {
  chrome: 'Chrome',
  'chromium-webview': 'Chrome (webview)',
  crios: 'Chrome (iOS)',
  edge: 'Edge',
  'edge-chromium': 'Edge',
  firefox: 'Firefox',
  fxios: 'Firefox (iOS)',
  ios: 'Safari (iOS)',
  'ios-webview': 'Safari (webview)',
  opera: 'Opera',
  safari: 'Safari',
  samsung: 'Samsung Internet',
  yandexbrowser: 'Yandex',
  brave: 'Brave',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function safe(fn: () => string | undefined, fallback: string): string {
  try {
    return fn() ?? fallback;
  } catch {
    return fallback;
  }
}

export function formatMetricLabel(type: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    if (type === 'referrer' || type === 'domain') return '(direct)';
    return '(unknown)';
  }

  switch (type) {
    case 'country':
      return safe(() => regionNames.of(value.toUpperCase()), value);
    case 'region': {
      // Stored as "US-CA": show the subdivision code with its country.
      const [country, sub] = value.split('-');
      return sub ? `${sub}, ${safe(() => regionNames.of(country), country)}` : value;
    }
    case 'language':
      return safe(() => languageNames.of(value), value);
    case 'channel':
      return CHANNELS[value] ?? capitalize(value);
    case 'browser':
      return BROWSERS[value] ?? capitalize(value);
    case 'device':
      return capitalize(value);
    default:
      return value;
  }
}

/** Two-letter country code for a row (country, or the country part of a region like "US-CA"). */
export function countryCode(value: string | null | undefined) {
  const letters = value?.slice(0, 2).toUpperCase();

  return letters && /^[A-Z]{2}$/.test(letters) ? letters : null;
}

/** Which URL filter a metric type maps to (entry/exit pages filter on path). */
export function filterNameFor(type: string): string | null {
  switch (type) {
    case 'entry':
    case 'exit':
      return 'path';
    case 'path':
    case 'referrer':
    case 'title':
    case 'query':
    case 'hostname':
    case 'browser':
    case 'os':
    case 'device':
    case 'country':
    case 'region':
    case 'city':
    case 'language':
    case 'event':
    case 'tag':
      return type;
    default:
      return null;
  }
}
