import type { Metadata } from 'next';
import { TeamsSettings } from '@/components/settings/teams-settings';

export const metadata: Metadata = { title: 'Teams' };

export default function TeamsPage() {
  return <TeamsSettings />;
}
