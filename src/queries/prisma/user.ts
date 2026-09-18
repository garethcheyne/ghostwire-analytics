import type { Prisma } from '@/generated/prisma/client';
import { ROLES } from '@/lib/constants';
import prisma from '@/lib/prisma';
import { sanitizeSortFilters } from '@/lib/sort';
import type { PageResult, QueryFilters, Role } from '@/lib/types';

/*
 * Users live in Better Auth's `user` table. Passwords are in `account` (hashed by Better Auth),
 * so creating users and setting passwords goes through the Better Auth admin API.
 */

const USER_SORT_FIELDS = ['username', 'name', 'role', 'createdAt'] as const;

const USER_SELECT = {
  id: true,
  username: true,
  name: true,
  email: true,
  image: true,
  role: true,
  banned: true,
  createdAt: true,
  twoFactorEnabled: true,
  twoFactorRequired: true,
} satisfies Prisma.UserSelect;

export interface UserSummary {
  id: string;
  username: string | null;
  name: string;
  email: string;
  role: string | null;
  createdAt: Date;
  twoFactorRequired: boolean;
  _count?: {
    websites: number;
  };
}

export async function getUser(userId: string) {
  return prisma.client.user.findUnique({ where: { id: userId }, select: USER_SELECT });
}

export async function getUserByUsername(username: string) {
  return prisma.client.user.findUnique({
    where: { username: username.toLowerCase() },
    select: USER_SELECT,
  });
}

export async function getUsers(
  criteria: Prisma.UserFindManyArgs,
  filters: QueryFilters = {},
): Promise<PageResult<UserSummary[]>> {
  const sortFilters = sanitizeSortFilters(filters, USER_SORT_FIELDS, {
    orderBy: 'createdAt',
    sortDescending: true,
  });
  const { search } = sortFilters;

  const where: Prisma.UserWhereInput = {
    ...criteria.where,
    ...prisma.getSearchParameters(search, [
      { username: 'contains' },
      { name: 'contains' },
      { email: 'contains' },
    ]),
  };

  return prisma.pagedQuery(
    'user',
    {
      ...criteria,
      where,
    },
    sortFilters,
  );
}

export async function createUser(data: {
  username: string;
  email: string;
  name?: string;
  password: string;
  role: Role;
}) {
  const { auth } = await import('@/lib/better-auth');
  const { user } = await auth.api.createUser({
    body: {
      email: data.email,
      password: data.password,
      name: data.name || data.username,
      role: data.role as typeof ROLES.admin | typeof ROLES.user | typeof ROLES.viewOnly,
      data: { username: data.username },
    },
  });

  return prisma.client.user.findUnique({ where: { id: user.id }, select: USER_SELECT });
}

export async function updateUser(
  userId: string,
  { password, ...data }: Prisma.UserUpdateInput & { password?: string },
) {
  if (password) {
    const account = await prisma.client.account.findFirst({
      where: { userId, providerId: 'credential' },
    });

    const { auth } = await import('@/lib/better-auth');
    const ctx = await auth.$context;
    const hash = await ctx.password.hash(password);

    if (account) {
      await prisma.client.account.update({ where: { id: account.id }, data: { password: hash } });
    } else {
      await ctx.internalAdapter.linkAccount({
        userId,
        providerId: 'credential',
        accountId: userId,
        password: hash,
      });
    }

    // Signing out everywhere mirrors Umami, which rejected tokens issued before a password change.
    await prisma.client.authSession.deleteMany({ where: { userId } });
  }

  return prisma.client.user.update({
    where: { id: userId },
    data,
    select: USER_SELECT,
  });
}

export async function deleteUser(userId: string) {
  const { client, transaction } = prisma;

  const websites = await client.website.findMany({ where: { userId } });
  const websiteIds = websites.map(a => a.id);

  // Teams the user owns are deleted with them.
  const teams = await client.organization.findMany({
    where: {
      members: {
        some: {
          userId,
          role: ROLES.teamOwner,
        },
      },
    },
  });
  const teamIds = teams.map(a => a.id);

  const ownedFilter = { OR: [{ userId }, { teamId: { in: teamIds } }] };

  const [links, pixels, boards] = await Promise.all([
    client.link.findMany({ where: ownedFilter, select: { id: true } }),
    client.pixel.findMany({ where: ownedFilter, select: { id: true } }),
    client.board.findMany({ where: ownedFilter, select: { id: true } }),
  ]);
  const entityIds = [...links.map(l => l.id), ...pixels.map(p => p.id), ...boards.map(b => b.id)];

  return transaction([
    client.eventData.deleteMany({ where: { websiteId: { in: websiteIds } } }),
    client.sessionData.deleteMany({ where: { websiteId: { in: websiteIds } } }),
    client.websiteEvent.deleteMany({ where: { websiteId: { in: websiteIds } } }),
    client.session.deleteMany({ where: { websiteId: { in: websiteIds } } }),
    client.member.deleteMany({
      where: { OR: [{ organizationId: { in: teamIds } }, { userId }] },
    }),
    client.invitation.deleteMany({ where: { organizationId: { in: teamIds } } }),
    client.organization.deleteMany({ where: { id: { in: teamIds } } }),
    client.report.deleteMany({
      where: { OR: [{ websiteId: { in: websiteIds } }, { userId }] },
    }),
    client.share.deleteMany({ where: { entityId: { in: entityIds } } }),
    client.link.deleteMany({ where: ownedFilter }),
    client.pixel.deleteMany({ where: ownedFilter }),
    client.board.deleteMany({ where: ownedFilter }),
    client.website.deleteMany({ where: { id: { in: websiteIds } } }),
    // Auth rows: sessions, credentials, 2FA and API keys.
    client.authSession.deleteMany({ where: { userId } }),
    client.account.deleteMany({ where: { userId } }),
    client.twoFactor.deleteMany({ where: { userId } }),
    client.apikey.deleteMany({ where: { referenceId: userId } }),
    client.user.delete({ where: { id: userId } }),
  ]);
}
