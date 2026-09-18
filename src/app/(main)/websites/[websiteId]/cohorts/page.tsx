import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SegmentsView } from '@/components/reports/segments-view';

export const metadata: Metadata = { title: 'Cohorts' };

export default function CohortsPage() {
  return (
    <Suspense>
      <SegmentsView type="cohort" />
    </Suspense>
  );
}
