import type { Member, Prisma } from '@/generated/prisma/client';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import type { PageResult, QueryFilters } from '@/lib/types';

/* Team members are Better Auth `member` rows (organizationId = Umami's teamId). */

export type TeamUser = Member;

export type TeamUserListItem = Member & {
  user?: {
    id: string;
    username: string | null;
    name: string;
  };
};

export async function findTeamUser(criteria: Prisma.MemberFindUniqueArgs) {
  return prisma.client.member.findUnique(criteria);
}

export async function getTeamUser(teamId: string, userId: string) {
  return prisma.client.member.findFirst({
    where: {
      organizationId: teamId,
      userId,
    },
  });
}

export async function getTeamUsers(
  criteria: Prisma.MemberFindManyArgs,
  filters: QueryFilters = {},
): Promise<PageResult<TeamUserListItem[]>> {
  const { search } = filters;

  const where: Prisma.MemberWhereInput = {
    ...criteria.where,
    ...prisma.getSearchParameters(search, [
      { user: { username: 'contains' } },
      { user: { name: 'contains' } },
    ]),
  };

  return prisma.pagedQuery(
    'member',
    {
      ...criteria,
      where,
    },
    filters,
  );
}

export async function createTeamUser(userId: string, teamId: string, role: string) {
  return prisma.client.member.create({
    data: {
      id: uuid(),
      userId,
      organizationId: teamId,
      role,
      createdAt: new Date(),
    },
  });
}

export async function updateTeamUser(teamUserId: string, data: Prisma.MemberUpdateInput) {
  return prisma.client.member.update({
    where: {
      id: teamUserId,
    },
    data,
  });
}

export async function deleteTeamUser(teamId: string, userId: string) {
  return prisma.client.member.deleteMany({
    where: {
      organizationId: teamId,
      userId,
    },
  });
}
