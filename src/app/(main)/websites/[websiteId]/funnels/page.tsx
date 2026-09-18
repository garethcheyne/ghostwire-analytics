import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FunnelsView } from '@/components/reports/funnels-view';

export const metadata: Metadata = { title: 'Funnels' };

export default function FunnelsPage() {
  return (
    <Suspense>
      <FunnelsView />
    </Suspense>
  );
}
