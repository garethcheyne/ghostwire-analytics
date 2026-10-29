import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DependenciesView } from '@/components/system/dependencies-view';

export const metadata: Metadata = { title: 'Dependencies' };

export default function Page() {
  return (
    <Suspense>
      <DependenciesView />
    </Suspense>
  );
}
