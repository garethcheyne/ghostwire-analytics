import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PerformanceView } from '@/components/analytics/performance-view';

export const metadata: Metadata = { title: 'Performance' };

export default function PerformancePage() {
  return (
    <Suspense>
      <PerformanceView />
    </Suspense>
  );
}
