import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';

const schema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  search: z.string().trim().max(200).optional(),
  /** Action prefix, e.g. auth, admin, team, website. */
  category: z.string().trim().max(30).optional(),
  /** Only failures (sign-ins and other refused auth actions). */
  failed: z.enum(['true', 'false']).optional(),
});

/** Admin only: the audit log, newest first. */
export async function GET(request: Request) {
  const { auth, query, error } = await parseRequest(request, schema);
  if (error) return error();

  if (!auth.user?.isAdmin) {
    return unauthorized();
  }

  const { page, pageSize, search, category, failed } = query;
  const where: Prisma.AuditLogWhereInput = {
    AND: [
      category ? { action: { startsWith: `${category}.` } } : {},
      failed === 'true' ? { action: { endsWith: '.failed' } } : {},
      search
        ? {
            OR: [
              { username: { contains: search, mode: 'insensitive' } },
              { action: { contains: search, mode: 'insensitive' } },
              { targetId: { contains: search, mode: 'insensitive' } },
              { ip: { contains: search } },
            ],
          }
        : {},
    ],
  };

  const [data, count] = await Promise.all([
    prisma.client.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.client.auditLog.count({ where }),
  ]);

  // Website names for display (websites may have been deleted since).
  const websiteIds = [...new Set(data.map(row => row.websiteId).filter(Boolean))] as string[];
  const websites = websiteIds.length
    ? await prisma.client.website.findMany({
        where: { id: { in: websiteIds } },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(websites.map(website => [website.id, website.name]));

  return json({
    data: data.map(row => ({
      ...row,
      websiteName: row.websiteId ? names.get(row.websiteId) : null,
    })),
    count,
    page,
    pageSize,
  });
}
