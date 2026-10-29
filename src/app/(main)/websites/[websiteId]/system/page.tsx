import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SystemOverviewView } from '@/components/system/overview-view';

export const metadata: Metadata = { title: 'System' };

export default function Page() {
  return (
    <Suspense>
      <SystemOverviewView />
    </Suspense>
  );
}
