import type { Metadata } from 'next';
import { TrackedDetail } from '@/components/tracked/tracked-detail';

export const metadata: Metadata = { title: 'Pixel' };

export default async function PixelPage({ params }: PageProps<'/pixels/[pixelId]'>) {
  const { pixelId } = await params;

  return <TrackedDetail kind="pixels" id={pixelId} />;
}
