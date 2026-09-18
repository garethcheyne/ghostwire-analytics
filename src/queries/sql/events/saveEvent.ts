
import { FIELD_LENGTH } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import { truncateString } from '@/lib/format';
import prisma from '@/lib/prisma';
import { saveEventData } from './saveEventData';
import { saveRevenue } from './saveRevenue';

export interface SaveEventArgs {
  websiteId: string;
  sessionId: string;
  visitId: string;
  eventType: number;
  createdAt?: Date;

  // Page
  pageTitle?: string | null;
  hostname?: string | null;
  urlPath: string;
  urlQuery?: string | null;
  referrerPath?: string | null;
  referrerQuery?: string | null;
  referrerDomain?: string | null;

  // Session
  distinctId?: string | null;
  browser?: string | null;
  os?: string | null;
  device?: string | null;
  screen?: string | null;
  language?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;

  // Events
  eventName?: string | null;
  eventData?: any;
  tag?: string | null;

  // UTM
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;

  // Click IDs
  gclid?: string | null;
  fbclid?: string | null;
  msclkid?: string | null;
  ttclid?: string | null;
  lifatid?: string | null;
  twclid?: string | null;

  // Performance
  lcp?: number;
  inp?: number;
  cls?: number;
  fcp?: number;
  ttfb?: number;
}

export async function saveEvent(args: SaveEventArgs) {
  return relationalQuery(args);
}

async function relationalQuery({
  websiteId,
  sessionId,
  visitId,
  eventType,
  createdAt,
  pageTitle,
  hostname,
  urlPath,
  urlQuery,
  referrerPath,
  referrerQuery,
  referrerDomain,
  eventName,
  eventData,
  tag,
  utmSource,
  utmMedium,
  utmCampaign,
  utmContent,
  utmTerm,
  gclid,
  fbclid,
  msclkid,
  ttclid,
  lifatid,
  twclid,
  lcp,
  inp,
  cls,
  fcp,
  ttfb,
}: SaveEventArgs) {
  const websiteEventId = uuid();

  await prisma.client.websiteEvent.create({
    data: {
      id: websiteEventId,
      websiteId,
      sessionId,
      visitId,
      urlPath: truncateString(urlPath, FIELD_LENGTH.url),
      urlQuery: truncateString(urlQuery, FIELD_LENGTH.url),
      utmSource: truncateString(utmSource, FIELD_LENGTH.fieldValue),
      utmMedium: truncateString(utmMedium, FIELD_LENGTH.fieldValue),
      utmCampaign: truncateString(utmCampaign, FIELD_LENGTH.fieldValue),
      utmContent: truncateString(utmContent, FIELD_LENGTH.fieldValue),
      utmTerm: truncateString(utmTerm, FIELD_LENGTH.fieldValue),
      referrerPath: truncateString(referrerPath, FIELD_LENGTH.url),
      referrerQuery: truncateString(referrerQuery, FIELD_LENGTH.url),
      referrerDomain: truncateString(referrerDomain, FIELD_LENGTH.url),
      pageTitle: truncateString(pageTitle, FIELD_LENGTH.pageTitle),
      gclid: truncateString(gclid, FIELD_LENGTH.fieldValue),
      fbclid: truncateString(fbclid, FIELD_LENGTH.fieldValue),
      msclkid: truncateString(msclkid, FIELD_LENGTH.fieldValue),
      ttclid: truncateString(ttclid, FIELD_LENGTH.fieldValue),
      lifatid: truncateString(lifatid, FIELD_LENGTH.fieldValue),
      twclid: truncateString(twclid, FIELD_LENGTH.fieldValue),
      eventType,
      eventName: truncateString(eventName, FIELD_LENGTH.eventName) ?? null,
      tag: truncateString(tag, FIELD_LENGTH.tag),
      hostname: truncateString(hostname, FIELD_LENGTH.hostname),
      lcp,
      inp,
      cls,
      fcp,
      ttfb,
      createdAt,
    },
  });

  if (eventData) {
    await saveEventData({
      websiteId,
      sessionId,
      eventId: websiteEventId,
      urlPath: truncateString(urlPath, FIELD_LENGTH.url),
      eventName: truncateString(eventName, FIELD_LENGTH.eventName),
      eventData,
      createdAt,
    });

    const { revenue, currency } = eventData;

    if (revenue > 0 && currency) {
      await saveRevenue({
        websiteId,
        sessionId,
        eventId: websiteEventId,
        eventName: truncateString(eventName, FIELD_LENGTH.eventName) ?? '',
        currency,
        revenue,
        createdAt: createdAt ?? new Date(),
      });
    }
  }
}
