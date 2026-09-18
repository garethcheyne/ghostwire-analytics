import type { Metadata } from 'next';
import { TeamDetail } from '@/components/settings/team-detail';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({ params }: PageProps<'/settings/teams/[teamId]'>) {
  const { teamId } = await params;

  return <TeamDetail teamId={teamId} />;
}
