import type { Metadata } from 'next';
import { Suspense } from 'react';
import { WebsiteSettingsView } from '@/components/websites/settings/website-settings-view';

export const metadata: Metadata = { title: 'Website settings' };

export default function WebsiteSettingsPage() {
  return (
    <Suspense>
      <WebsiteSettingsView />
    </Suspense>
  );
}
