import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RevenueView } from '@/components/reports/revenue-view';

export const metadata: Metadata = { title: 'Revenue' };

export default function RevenuePage() {
  return (
    <Suspense>
      <RevenueView />
    </Suspense>
  );
}
