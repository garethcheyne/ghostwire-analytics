import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TracesView } from '@/components/system/traces-view';

export const metadata: Metadata = { title: 'Traces' };

export default function Page() {
  return (
    <Suspense>
      <TracesView />
    </Suspense>
  );
}
