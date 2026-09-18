import type { Metadata } from 'next';
import { AdminTeams } from '@/components/admin/admin-lists';

export const metadata: Metadata = { title: 'Teams' };

export default function AdminTeamsPage() {
  return <AdminTeams />;
}
