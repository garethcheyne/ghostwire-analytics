import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ReplaysView } from '@/components/replays/replays-view';

export const metadata: Metadata = { title: 'Replays' };

export default function ReplaysPage() {
  return (
    <Suspense>
      <ReplaysView />
    </Suspense>
  );
}
