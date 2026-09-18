import type { Metadata } from 'next';
import { SessionDetail } from '@/components/analytics/session-detail';

export const metadata: Metadata = { title: 'Session' };

export default async function SessionPage({
  params,
}: PageProps<'/websites/[websiteId]/sessions/[sessionId]'>) {
  const { sessionId } = await params;

  return <SessionDetail sessionId={sessionId} />;
}
