/*
 * Support links: an expiring, read-only page with one identified user's timeline, for pasting
 * into a support ticket. Anyone with the link can open it until it expires or is revoked.
 */
import { randomBytes } from 'node:crypto';
import prisma from '@/lib/prisma';

export const SUPPORT_LINK_MAX_DAYS = 30;

export function createSupportSlug() {
  return randomBytes(18).toString('base64url');
}

/** The link if it exists and hasn't expired. */
export async function getActiveSupportLink(slug: string) {
  if (!/^[\w-]{16,64}$/.test(slug)) return null;

  const link = await prisma.client.supportLink.findUnique({ where: { slug } });
  return link && link.expiresAt > new Date() ? link : null;
}
