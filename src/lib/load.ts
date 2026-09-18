import type { Session, Website } from '@/generated/prisma/client';
import { getWebsite } from '@/queries/prisma';
import { getWebsiteSession } from '@/queries/sql';

export async function fetchWebsite(websiteId: string): Promise<Website | null> {
  const website = await getWebsite(websiteId);

  if (!website || website.deletedAt) {
    return null;
  }

  return website;
}

export async function fetchSession(websiteId: string, sessionId: string): Promise<Session | null> {
  return (await getWebsiteSession(websiteId, sessionId)) ?? null;
}
