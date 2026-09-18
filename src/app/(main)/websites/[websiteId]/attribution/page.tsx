import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AttributionView } from '@/components/reports/attribution-view';

export const metadata: Metadata = { title: 'Attribution' };

export default function AttributionPage() {
  return (
    <Suspense>
      <AttributionView />
    </Suspense>
  );
}
