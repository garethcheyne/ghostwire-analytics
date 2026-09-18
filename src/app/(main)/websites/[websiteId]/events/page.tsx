import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EventsView } from '@/components/analytics/events-view';

export const metadata: Metadata = { title: 'Events' };

export default function EventsPage() {
  return (
    <Suspense>
      <EventsView />
    </Suspense>
  );
}
