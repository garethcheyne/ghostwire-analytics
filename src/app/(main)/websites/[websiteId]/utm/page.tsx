import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UtmView } from '@/components/reports/utm-view';

export const metadata: Metadata = { title: 'UTM' };

export default function UtmPage() {
  return (
    <Suspense>
      <UtmView />
    </Suspense>
  );
}
