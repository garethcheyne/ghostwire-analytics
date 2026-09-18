import type { Metadata } from 'next';
import { Suspense } from 'react';
import { JourneysView } from '@/components/reports/journeys-view';

export const metadata: Metadata = { title: 'Journeys' };

export default function JourneysPage() {
  return (
    <Suspense>
      <JourneysView />
    </Suspense>
  );
}
