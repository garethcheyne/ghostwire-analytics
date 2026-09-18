import type { Metadata } from 'next';
import { TrackedEntitiesView } from '@/components/tracked/tracked-entities';

export const metadata: Metadata = { title: 'Pixels' };

export default function PixelsPage() {
  return <TrackedEntitiesView kind="pixels" />;
}
