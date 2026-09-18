import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SessionsView } from '@/components/analytics/sessions-view';

export const metadata: Metadata = { title: 'Sessions' };

export default function SessionsPage() {
  return (
    <Suspense>
      <SessionsView />
    </Suspense>
  );
}
