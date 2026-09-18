import type { Metadata } from 'next';
import { TrackedDetail } from '@/components/tracked/tracked-detail';

export const metadata: Metadata = { title: 'Link' };

export default async function LinkPage({ params }: PageProps<'/links/[linkId]'>) {
  const { linkId } = await params;

  return <TrackedDetail kind="links" id={linkId} />;
}
