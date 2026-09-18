import type { Link, Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { deleteWebsiteDependentData } from './website';
import { sanitizeSortFilters } from '@/lib/sort';
import type { PageResult, QueryFilters } from '@/lib/types';

const LINK_SORT_FIELDS = ['name', 'slug', 'url', 'createdAt'] as const;

export async function findLink(criteria: Prisma.LinkFindUniqueArgs) {
  return prisma.client.link.findUnique(criteria);
}

export async function getLink(linkId: string) {
  return findLink({
    where: {
      id: linkId,
    },
  });
}

export async function getLinks(
  criteria: Prisma.LinkFindManyArgs,
  filters: QueryFilters = {},
): Promise<PageResult<Link[]>> {
  const sortFilters = sanitizeSortFilters(filters, LINK_SORT_FIELDS);
  const { search } = sortFilters;
  const { getSearchParameters, pagedQuery } = prisma;

  const where: Prisma.LinkWhereInput = {
    ...criteria.where,
    ...getSearchParameters(search, [
      { name: 'contains' },
      { url: 'contains' },
      { slug: 'contains' },
    ]),
  };

  return pagedQuery('link', { ...criteria, where }, sortFilters);
}

export async function getUserLinks(userId: string, filters?: QueryFilters) {
  return getLinks(
    {
      where: {
        userId,
        deletedAt: null,
      },
    },
    filters,
  );
}

export async function getTeamLinks(teamId: string, filters?: QueryFilters) {
  return getLinks(
    {
      where: {
        teamId,
      },
    },
    filters,
  );
}

export async function createLink(data: Prisma.LinkUncheckedCreateInput) {
  return prisma.client.link.create({ data });
}

export async function updateLink(linkId: string, data: any) {
  return prisma.client.link.update({ where: { id: linkId }, data });
}

/** Deletes a link with its clicks (recorded under the link's id) and shares. */
export async function deleteLink(linkId: string) {
  return prisma.transaction(async (tx: any) => {
    await deleteWebsiteDependentData(tx, linkId);
    await tx.share.deleteMany({ where: { entityId: linkId } });

    return tx.link.delete({ where: { id: linkId } });
  });
}
