import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { WebsiteProvider } from '@/components/websites/website-context';
import { getAuthFromHeaders } from '@/lib/auth';
import type { Auth } from '@/lib/types';
import { canDeleteWebsite, canUpdateWebsite, canViewWebsite } from '@/permissions';
import { getWebsite } from '@/queries/prisma';

export default async function WebsiteLayout({
  children,
  params,
}: LayoutProps<'/websites/[websiteId]'>) {
  const { websiteId } = await params;
  const auth = (await getAuthFromHeaders(await headers())) as Auth | null;
  const website = await getWebsite(websiteId);

  // Same answer for "doesn't exist" and "not yours", so ids can't be probed.
  if (!auth || !website || website.deletedAt || !(await canViewWebsite(auth, websiteId))) {
    notFound();
  }

  const [canUpdate, canDelete] = await Promise.all([
    canUpdateWebsite(auth, websiteId),
    canDeleteWebsite(auth, websiteId),
  ]);

  return (
    <WebsiteProvider
      website={{
        id: website.id,
        name: website.name,
        domain: website.domain,
        teamId: website.teamId,
        userId: website.userId,
        canUpdate: !!canUpdate,
        canDelete: !!canDelete,
      }}
    >
      {children}
    </WebsiteProvider>
  );
}
