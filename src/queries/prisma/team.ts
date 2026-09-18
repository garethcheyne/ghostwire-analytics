import type { Member, Organization, Prisma } from '@/generated/prisma/client';
import { ROLES } from '@/lib/constants';
import { uuid } from '@/lib/crypto';
import prisma from '@/lib/prisma';
import { sanitizeSortFilters } from '@/lib/sort';
import type { PageResult, QueryFilters } from '@/lib/types';

/*
 * Umami teams are Better Auth organizations; team members are `member` rows. Queries write to
 * the tables directly (the API routes do their own permission checks).
 */

export type Team = Organization;

const TEAM_SORT_FIELDS = ['name', 'createdAt'] as const;

export async function findTeam(criteria: Prisma.OrganizationFindUniqueArgs) {
  return prisma.client.organization.findUnique(criteria);
}

export async function getTeam(teamId: string, options: { includeMembers?: boolean } = {}) {
  const { includeMembers } = options;

  return findTeam({
    where: {
      id: teamId,
    },
    ...(includeMembers && { include: { members: true } }),
  });
}

export async function getTeams(
  criteria: Prisma.OrganizationFindManyArgs,
  filters: QueryFilters,
): Promise<PageResult<Team[]>> {
  const { getSearchParameters } = prisma;
  const sortFilters = sanitizeSortFilters(filters, TEAM_SORT_FIELDS);
  const { search } = sortFilters;

  const where: Prisma.OrganizationWhereInput = {
    ...criteria.where,
    ...getSearchParameters(search, [{ name: 'contains' }]),
  };

  return prisma.pagedQuery<Prisma.OrganizationFindManyArgs>(
    'organization',
    {
      ...criteria,
      where,
    },
    sortFilters,
  );
}

export async function getUserTeams(userId: string, filters: QueryFilters = {}) {
  return getTeams(
    {
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            websites: {
              where: { deletedAt: null },
            },
            members: true,
          },
        },
      },
    },
    filters,
  );
}

export async function getAllUserTeams(userId: string) {
  return prisma.client.organization.findMany({
    where: {
      members: {
        some: { userId },
      },
    },
    select: {
      id: true,
      name: true,
      logo: true,
    },
  });
}

export async function getUserOwnedTeamCount(userId: string) {
  return prisma.client.organization.count({
    where: {
      members: {
        some: { userId, role: ROLES.teamOwner },
      },
    },
  });
}

export async function getTeamOwner(teamId: string) {
  return prisma.client.member.findFirst({
    where: { organizationId: teamId, role: ROLES.teamOwner },
    select: { userId: true },
  });
}

export async function createTeam(
  data: { id: string; name: string; accessCode?: string; logo?: string },
  userId: string,
): Promise<[Organization, Member]> {
  const { client, transaction } = prisma;
  const now = new Date();

  return transaction([
    client.organization.create({
      data: {
        ...data,
        // Organizations need a unique slug; teams are addressed by id, so derive it.
        slug: `team-${data.id}`,
        createdAt: now,
      },
    }),
    client.member.create({
      data: {
        id: uuid(),
        organizationId: data.id,
        userId,
        role: ROLES.teamOwner,
        createdAt: now,
      },
    }),
  ]) as Promise<[Organization, Member]>;
}

export async function updateTeam(teamId: string, data: Prisma.OrganizationUpdateInput) {
  return prisma.client.organization.update({
    where: {
      id: teamId,
    },
    data,
  });
}

export async function deleteTeam(teamId: string) {
  const { client, transaction } = prisma;

  const [links, pixels, boards] = await Promise.all([
    client.link.findMany({ where: { teamId }, select: { id: true } }),
    client.pixel.findMany({ where: { teamId }, select: { id: true } }),
    client.board.findMany({ where: { teamId }, select: { id: true } }),
  ]);
  const entityIds = [...links.map(l => l.id), ...pixels.map(p => p.id), ...boards.map(b => b.id)];

  return transaction([
    client.member.deleteMany({ where: { organizationId: teamId } }),
    client.invitation.deleteMany({ where: { organizationId: teamId } }),
    client.share.deleteMany({ where: { entityId: { in: entityIds } } }),
    client.link.deleteMany({ where: { teamId } }),
    client.pixel.deleteMany({ where: { teamId } }),
    client.board.deleteMany({ where: { teamId } }),
    client.organization.delete({ where: { id: teamId } }),
  ]);
}
