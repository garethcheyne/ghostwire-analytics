import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HeatmapsView } from '@/components/heatmaps/heatmaps-view';

export const metadata: Metadata = { title: 'Heatmaps' };

export default function HeatmapsPage() {
  return (
    <Suspense>
      <HeatmapsView />
    </Suspense>
  );
}
