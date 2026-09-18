import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CompareView } from '@/components/analytics/compare-view';

export const metadata: Metadata = { title: 'Compare' };

export default function ComparePage() {
  return (
    <Suspense>
      <CompareView />
    </Suspense>
  );
}
