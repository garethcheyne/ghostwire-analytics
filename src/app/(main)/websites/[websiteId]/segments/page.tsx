import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SegmentsView } from '@/components/reports/segments-view';

export const metadata: Metadata = { title: 'Segments' };

export default function SegmentsPage() {
  return (
    <Suspense>
      <SegmentsView type="segment" />
    </Suspense>
  );
}
