import type { Metadata } from 'next';
import { AdminSecurity } from '@/components/admin/admin-lists';

export const metadata: Metadata = { title: 'Security' };

export default function AdminSecurityPage() {
  return <AdminSecurity />;
}
