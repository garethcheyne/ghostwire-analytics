import type { Metadata } from 'next';
import { WebsitesView } from '@/components/websites/websites-view';

export const metadata: Metadata = { title: 'Websites' };

export default function WebsitesPage() {
  return <WebsitesView />;
}
