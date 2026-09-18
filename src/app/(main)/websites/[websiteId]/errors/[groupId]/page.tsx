import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ErrorDetail } from '@/components/errors/error-detail';

export const metadata: Metadata = { title: 'Error' };

export default async function ErrorPage({
  params,
}: PageProps<'/websites/[websiteId]/errors/[groupId]'>) {
  const { groupId } = await params;

  return (
    <Suspense>
      <ErrorDetail groupId={groupId} />
    </Suspense>
  );
}
