import { expect, test, vi } from 'vitest';

const pagedQuery = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: { pagedQuery, getSearchParameters: () => ({}), client: {} },
}));

const { getUserTeams, hideAccessCode } = await import('./team');

const team = (role: string) => ({
  id: `t-${role}`,
  name: role,
  accessCode: `team_${role}`,
  members: [
    { userId: 'me', role },
    { userId: 'other', role: 'owner' },
  ],
});

test('only owners and managers see a team access code in their team list', async () => {
  pagedQuery.mockResolvedValue({
    data: [team('owner'), team('manager'), team('member'), team('viewer')],
    count: 4,
    page: 1,
    pageSize: 20,
  });

  const { data, count } = await getUserTeams('me');

  expect(count).toBe(4);
  expect(data.map(t => t.accessCode)).toEqual(['team_owner', 'team_manager', null, null]);
});

test('hideAccessCode keeps everything else', () => {
  expect(hideAccessCode(team('viewer'), false)).toMatchObject({ id: 't-viewer', accessCode: null });
  expect(hideAccessCode(team('owner'), true).accessCode).toBe('team_owner');
});
