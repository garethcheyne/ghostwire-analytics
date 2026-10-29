import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EndpointsView } from '@/components/system/endpoints-view';

export const metadata: Metadata = { title: 'Endpoints' };

export default function Page() {
  return (
    <Suspense>
      <EndpointsView />
    </Suspense>
  );
}
