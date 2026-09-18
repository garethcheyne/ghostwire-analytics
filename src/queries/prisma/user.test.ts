import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getUserByUsername } from './user';

const { findUniqueMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    client: {
      user: {
        findUnique: findUniqueMock,
      },
    },
  },
}));

describe('getUserByUsername', () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
    findUniqueMock.mockResolvedValue(null);
  });

  test('normalizes usernames to lowercase before lookup', async () => {
    await getUserByUsername('KaKi87');

    expect(findUniqueMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          username: 'kaki87',
        },
      }),
    );
  });

  test('never selects credentials (they live in the Better Auth account table)', async () => {
    await getUserByUsername('someone');

    const [{ select }] = findUniqueMock.mock.calls[0];

    expect(select).not.toHaveProperty('password');
    expect(select).toMatchObject({ id: true, username: true, role: true });
  });
});
