import { type DocumentProps, renderToBuffer } from '@react-pdf/renderer';
import { createElement, type ReactElement } from 'react';
import { getTrafficReportData } from '@/lib/reports/traffic-data';
import { TrafficReport } from '@/lib/reports/traffic-report';
import { getQueryFilters, parseRequest } from '@/lib/request';
import { badRequest, notFound, unauthorized } from '@/lib/response';
import { filterParams, withDateRange } from '@/lib/schema';
import { canViewAuthenticatedWebsite } from '@/permissions';
import { getWebsite } from '@/queries/prisma';

// react-pdf renders with Node APIs, so this route cannot run on the edge.
export const runtime = 'nodejs';

const day = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

/** e.g. "1 September – 30 September 2026", dropping the repeated year. */
function periodLabel(startDate: Date, endDate: Date) {
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
  const start = sameYear
    ? startDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })
    : day(startDate);

  return `${start} – ${day(endDate)}`;
}

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'report'
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  const schema = withDateRange({ ...filterParams });
  const { auth, query, error } = await parseRequest(request, schema);

  if (error) {
    return error();
  }

  const { websiteId } = await params;

  // The same gate as the CSV export: a report is every figure the site has,
  // in one file, so a share token is not enough to pull one.
  if (!(await canViewAuthenticatedWebsite(auth, websiteId))) {
    return unauthorized();
  }

  const website = await getWebsite(websiteId);

  if (!website) {
    return notFound();
  }

  const filters = await getQueryFilters(query, websiteId);
  const { startDate, endDate } = filters;

  // withDateRange makes these required in the query, but QueryFilters types
  // them as optional. Narrowed here rather than asserted, so a request that
  // somehow arrives without a range gets an error instead of an Invalid Date
  // rendered into the PDF.
  if (!startDate || !endDate) {
    return badRequest({ date: 'A start and end date are required.' });
  }

  // The period of the same length immediately before this one, so "on last
  // period" means the same thing whichever range was picked.
  const span = endDate.getTime() - startDate.getTime();
  const previousFilters = {
    ...filters,
    startDate: new Date(startDate.getTime() - span - 1),
    endDate: new Date(startDate.getTime() - 1),
  };

  const data = await getTrafficReportData(websiteId, filters, previousFilters);

  // The report renders a <Document>, but its own props are the report's, not
  // DocumentProps — react-pdf types the entry point by the element it expects
  // rather than by what the component accepts.
  const document = createElement(TrafficReport, {
    meta: {
      siteName: website.name,
      title: 'Traffic report',
      period: periodLabel(startDate, endDate),
      generatedAt: new Date(),
    },
    data,
  }) as unknown as ReactElement<DocumentProps>;

  const pdf = await renderToBuffer(document);

  const filename = `${slugify(website.name)}-traffic-${startDate.toISOString().slice(0, 10)}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdf.length),
      // A report is a point-in-time document; a cached copy would quietly go
      // stale behind whoever downloaded it first.
      'Cache-Control': 'no-store',
    },
  });
}
