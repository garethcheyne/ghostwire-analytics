import { z } from 'zod';
import { uuid } from '@/lib/crypto';
import { isEmailConfigured } from '@/lib/notify';
import prisma from '@/lib/prisma';
import { parseRequest } from '@/lib/request';
import { json, unauthorized } from '@/lib/response';

/** Your email report settings (frequency 'off' when there's none). */
export async function GET(request: Request) {
  const { auth, error } = await parseRequest(request);
  if (error) return error();
  if (!auth.user) return unauthorized();

  const report = await prisma.client.emailReport.findUnique({ where: { userId: auth.user.id } });
  const user = await prisma.client.user.findUnique({
    where: { id: auth.user.id },
    select: { email: true },
  });

  return json({
    frequency: report?.frequency ?? 'off',
    websiteIds: report?.websiteIds ?? [],
    lastSentAt: report?.lastSentAt ?? null,
    email: user?.email ?? null,
    emailConfigured: isEmailConfigured(),
  });
}

const schema = z.object({
  frequency: z.enum(['off', 'weekly', 'monthly']),
  websiteIds: z.array(z.uuid()).max(20).default([]),
});

export async function POST(request: Request) {
  const { auth, body, error } = await parseRequest(request, schema);
  if (error) return error();
  if (!auth.user) return unauthorized();

  if (body.frequency === 'off') {
    await prisma.client.emailReport.deleteMany({ where: { userId: auth.user.id } });
    return json({ frequency: 'off', websiteIds: [] });
  }

  const report = await prisma.client.emailReport.upsert({
    where: { userId: auth.user.id },
    create: {
      id: uuid(),
      userId: auth.user.id,
      frequency: body.frequency,
      websiteIds: body.websiteIds,
    },
    update: { frequency: body.frequency, websiteIds: body.websiteIds },
  });

  return json({ frequency: report.frequency, websiteIds: report.websiteIds });
}
