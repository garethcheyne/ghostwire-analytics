import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InfrastructureView } from '@/components/system/infrastructure-view';

export const metadata: Metadata = { title: 'Infrastructure' };

export default function Page() {
  return (
    <Suspense>
      <InfrastructureView />
    </Suspense>
  );
}
