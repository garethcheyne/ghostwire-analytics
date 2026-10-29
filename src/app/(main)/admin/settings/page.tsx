import type { Metadata } from 'next';
import { AdminSettingsView } from '@/components/admin/admin-settings';

export const metadata: Metadata = { title: 'Settings' };

export default function AdminSettingsPage() {
  return <AdminSettingsView />;
}
