import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BreakdownView } from '@/components/analytics/breakdown-view';

export const metadata: Metadata = { title: 'Breakdown' };

export default function BreakdownPage() {
  return (
    <Suspense>
      <BreakdownView />
    </Suspense>
  );
}
