import type { Metadata } from 'next';
import { Suspense } from 'react';
import { GoalsView } from '@/components/reports/goals-view';

export const metadata: Metadata = { title: 'Goals' };

export default function GoalsPage() {
  return (
    <Suspense>
      <GoalsView />
    </Suspense>
  );
}
