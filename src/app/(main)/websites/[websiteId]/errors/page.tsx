import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ErrorsView } from '@/components/errors/errors-view';

export const metadata: Metadata = { title: 'Errors' };

export default function ErrorsPage() {
  return (
    <Suspense>
      <ErrorsView />
    </Suspense>
  );
}
