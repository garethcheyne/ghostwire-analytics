import type { Metadata } from 'next';
import { NotificationsSettings } from '@/components/settings/notifications-settings';

export const metadata: Metadata = { title: 'Notifications' };

export default function NotificationsPage() {
  return <NotificationsSettings />;
}
