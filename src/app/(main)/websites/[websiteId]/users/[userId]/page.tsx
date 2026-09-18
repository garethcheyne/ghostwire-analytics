import type { Metadata } from 'next';
import { UserDetail } from '@/components/users/user-detail';

export const metadata: Metadata = { title: 'User' };

export default async function UserPage({
  params,
}: PageProps<'/websites/[websiteId]/users/[userId]'>) {
  const { userId } = await params;

  return <UserDetail userId={userId} />;
}
