import { beforeEach, expect, test, vi } from 'vitest';

const registerDeploy = vi.fn(async (_websiteId: string, data: any) => ({ id: 'r1', ...data }));

vi.mock('@/lib/audit', () => ({ audit: vi.fn() }));
vi.mock('@/lib/website-key', () => ({ authorizeWebsiteWrite: vi.fn(async () => true) }));
vi.mock('@/lib/releases', () => ({ registerDeploy, normalizeRelease: (value: string) => value.trim() }));
vi.mock('@/permissions', () => ({ canViewAuthenticatedWebsite: vi.fn() }));
vi.mock('@/queries/sql/releases/getReleases', () => ({ getReleases: vi.fn() }));
vi.mock('@/lib/request', () => ({ parseRequest: vi.fn() }));

const { POST } = await import('./route');

const context = { params: Promise.resolve({ websiteId: 'w1' }) };
const deploy = (body: unknown) =>
  POST(new Request('https://example.org/api', { method: 'POST', body: JSON.stringify(body) }), context);

beforeEach(() => registerDeploy.mockClear());

test('records a deploy with an https link', async () => {
  const response = await deploy({ version: '1.2.0', commit: 'abc1234', url: 'https://github.com/o/r/commit/abc1234' });

  expect(response.status).toBe(200);
  expect(registerDeploy).toHaveBeenCalledWith('w1', expect.objectContaining({ url: 'https://github.com/o/r/commit/abc1234' }));
});

test('refuses a link that is not http(s), since the Releases page renders it', async () => {
  for (const url of ['javascript:alert(1)//', 'data:text/html,<script>alert(1)</script>', 'ftp://example.org/x']) {
    const response = await deploy({ version: '1.2.0', url });
    expect(response.status).toBe(400);
  }
  expect(registerDeploy).not.toHaveBeenCalled();
});
