import type { Metadata } from 'next';
import { AdminWebsites } from '@/components/admin/admin-lists';

export const metadata: Metadata = { title: 'Websites' };

export default function AdminWebsitesPage() {
  return <AdminWebsites />;
}
