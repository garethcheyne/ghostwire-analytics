import type { Metadata } from 'next';
import { RealtimeView } from '@/components/analytics/realtime-view';

export const metadata: Metadata = { title: 'Realtime' };

export default function RealtimePage() {
  return <RealtimeView />;
}
