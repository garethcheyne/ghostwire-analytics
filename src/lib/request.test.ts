import { beforeEach, expect, test, vi } from 'vitest';
import { fetchWebsite } from '@/lib/load';
import { getWebsiteSegment } from '@/queries/prisma';
import { checkAuth } from '@/lib/auth';
import { getQueryFilters, parseRequest } from './request';

vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/umami?schema=public';
  delete process.env.DATABASE_REPLICA_URL;
});

vi.mock('@/lib/load', () => ({
  fetchAccount: vi.fn(),
  fetchWebsite: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ checkAuth: vi.fn() }));

vi.mock('@/queries/prisma', () => ({
  getWebsiteSegment: vi.fn(),
}));

const fetchWebsiteMock = vi.mocked(fetchWebsite);
const getWebsiteSegmentMock = vi.mocked(getWebsiteSegment);

beforeEach(() => {
  fetchWebsiteMock.mockReset();
  getWebsiteSegmentMock.mockReset();
  fetchWebsiteMock.mockResolvedValue({ id: 'website-1' } as any);
});

test('combines a saved segment\'s session property filters with active filters', async () => {
  getWebsiteSegmentMock.mockResolvedValue({
    parameters: {
      filters: [],
      sessionPropertyFilters: [
        { propertyName: 'plan', dataType: 1, operator: 'eq', value: 'pro' },
      ],
    },
  } as any);

  const filters = await getQueryFilters(
    {
      startAt: String(+new Date('2026-09-01T00:00:00.000Z')),
      endAt: String(+new Date('2026-09-02T00:00:00.000Z')),
      segment: 'segment-1',
      spf0: '1.eq.country.US',
    },
    'website-1',
  );

  expect(filters.sessionPropertyFilters).toEqual([
    { propertyName: 'country', dataType: 1, operator: 'eq', value: 'US' },
    { propertyName: 'plan', dataType: 1, operator: 'eq', value: 'pro' },
  ]);
});

test('share links never see identified users', async () => {
  vi.mocked(checkAuth).mockResolvedValue({ user: null, shareToken: { websiteId: 'w' } } as any);

  const filtered = await parseRequest(
    new Request('https://gw.test/api/x?distinctId=eq.alice&distinctId2=eq.bob&browser=eq.Chrome'),
  );
  expect(filtered.error).toBeUndefined();
  expect(filtered.query).toEqual({ browser: 'eq.Chrome' });

  const listed = await parseRequest(new Request('https://gw.test/api/x?type=distinctId'));
  expect(listed.error().status).toBe(403);
});

test('signed-in users keep identified-user filters', async () => {
  vi.mocked(checkAuth).mockResolvedValue({ user: { id: 'u1' } } as any);

  const { query, error } = await parseRequest(
    new Request('https://gw.test/api/x?distinctId=eq.alice&type=distinctId'),
  );
  expect(error).toBeUndefined();
  expect(query).toEqual({ distinctId: 'eq.alice', type: 'distinctId' });
});
