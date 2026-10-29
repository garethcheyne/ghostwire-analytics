import { beforeEach, describe, expect, test, vi } from 'vitest';

// Session data is what sites send with identify() (emails, plans, names). A share link may be
// allowed to see the sessions section, but never these routes.
const mocks = vi.hoisted(() => ({
  signedIn: false,
  query: vi.fn(async (..._args: any[]) => []),
}));

vi.mock('@/permissions', () => ({
  canViewWebsiteSection: vi.fn(async () => true),
  canViewAuthenticatedWebsite: vi.fn(async () => mocks.signedIn),
}));
vi.mock('@/lib/request', () => ({
  parseRequest: async () => ({ auth: {}, query: { propertyName: 'email', startAt: 0, endAt: 1 } }),
  getQueryFilters: vi.fn(async () => ({ startDate: new Date(0), endDate: new Date(1) })),
}));
vi.mock('@/lib/params', () => ({ parsePropertyFilters: () => [] }));
vi.mock('@/queries/sql', () => ({
  getSessionDataArraySeries: mocks.query,
  getSessionDataDateSeries: mocks.query,
  getSessionDataNumericSeries: mocks.query,
  getSessionDataNumericStats: mocks.query,
  getSessionDataProperties: mocks.query,
  getSessionDataPropertySeries: mocks.query,
  getSessionDataValues: mocks.query,
}));
vi.mock('@/queries/sql/sessions/getSessionDataActivityStats', () => ({ getSessionDataActivityStats: mocks.query }));
vi.mock('@/queries/sql/sessions/getSessionDataPivot', () => ({ getSessionDataPivot: mocks.query }));

import { GET as arraySeriesRoute } from '@/app/api/websites/[websiteId]/session-data/array-series/route';
import { GET as dateSeriesRoute } from '@/app/api/websites/[websiteId]/session-data/date-series/route';
import { GET as numericSeriesRoute } from '@/app/api/websites/[websiteId]/session-data/numeric-series/route';
import { GET as numericStatsRoute } from '@/app/api/websites/[websiteId]/session-data/numeric-stats/route';
import { GET as propertiesRoute } from '@/app/api/websites/[websiteId]/session-data/properties/route';
import { GET as propertySeriesRoute } from '@/app/api/websites/[websiteId]/session-data/property-series/route';
import { GET as statsRoute } from '@/app/api/websites/[websiteId]/session-data/stats/route';
import { GET as valuesRoute } from '@/app/api/websites/[websiteId]/session-data/values/route';
import { GET as pivotRoute } from '@/app/api/websites/[websiteId]/session-data-pivot/route';

const routes = {
  'array-series': arraySeriesRoute,
  'date-series': dateSeriesRoute,
  'numeric-series': numericSeriesRoute,
  'numeric-stats': numericStatsRoute,
  'properties': propertiesRoute,
  'property-series': propertySeriesRoute,
  'stats': statsRoute,
  'values': valuesRoute,
  'pivot': pivotRoute,
};

describe.each(Object.entries(routes))('session-data %s', (_name, GET) => {
  const context = { params: Promise.resolve({ websiteId: 'website' }) };

  beforeEach(() => mocks.query.mockClear());

  test('refuses a share link', async () => {
    mocks.signedIn = false;
    const response = await GET(new Request('https://example.org/api'), context);

    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  test('answers a signed-in viewer', async () => {
    mocks.signedIn = true;
    const response = await GET(new Request('https://example.org/api'), context);

    expect(response.status).toBe(200);
    expect(mocks.query).toHaveBeenCalled();
  });
});
