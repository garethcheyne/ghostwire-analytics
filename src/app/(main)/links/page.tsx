import type { Metadata } from 'next';
import { TrackedEntitiesView } from '@/components/tracked/tracked-entities';

export const metadata: Metadata = { title: 'Links' };

export default function LinksPage() {
  return <TrackedEntitiesView kind="links" />;
}
