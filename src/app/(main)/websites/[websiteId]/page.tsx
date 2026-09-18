import type { Metadata } from 'next';
import { Suspense } from 'react';
import { WebsiteOverview } from '@/components/analytics/website-overview';

export const metadata: Metadata = { title: 'Overview' };

export default function WebsiteOverviewPage() {
  return (
    <Suspense>
      <WebsiteOverview />
    </Suspense>
  );
}
