'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCurrentWebsite } from '../website-context';
import { AlertSettings } from './alert-settings';
import { DataSettings } from './data-settings';
import { GeneralSettings } from './general-settings';
import { ErrorSettings } from './error-settings';
import { RecordingSettings } from './recording-settings';
import { SharingSettings } from './sharing-settings';
import { TrackingCode } from './tracking-code';

const TABS = [
  { id: 'general', label: 'General', content: GeneralSettings },
  { id: 'tracking', label: 'Tracking code', content: TrackingCode },
  { id: 'recording', label: 'Replays & heatmaps', content: RecordingSettings },
  { id: 'errors', label: 'Errors', content: ErrorSettings },
  { id: 'alerts', label: 'Alerts', content: AlertSettings },
  { id: 'sharing', label: 'Sharing', content: SharingSettings },
  { id: 'data', label: 'Data', content: DataSettings },
] as const;

export function WebsiteSettingsView() {
  const website = useCurrentWebsite();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = TABS.some(t => t.id === searchParams.get('tab'))
    ? searchParams.get('tab')!
    : 'general';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description={`${website.name} · ${website.domain ?? ''}`} />
      <Tabs
        value={tab}
        onValueChange={value => router.replace(`${pathname}?tab=${value}`, { scroll: false })}
      >
        <TabsList className="max-w-full overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <TabsTrigger key={id} value={id}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ id, content: Content }) => (
          <TabsContent key={id} value={id} className="mt-4">
            <Content />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
