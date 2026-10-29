import type { Metadata } from 'next';
import { Suspense } from 'react';
import { JobsView } from '@/components/system/jobs-view';

export const metadata: Metadata = { title: 'Jobs and workers' };

export default function Page() {
  return (
    <Suspense>
      <JobsView />
    </Suspense>
  );
}
