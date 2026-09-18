'use client';
import { Info } from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useWebsite } from '@/hooks/queries/websites';

/** Tells editors when replays or heatmaps aren't being collected, with a link to turn them on. */
export function RecordingNotice({
  websiteId,
  kind,
}: {
  websiteId: string;
  kind: 'replays' | 'heatmaps';
}) {
  const { data: website } = useWebsite(websiteId);

  if (!website) return null;

  const config = website.replayConfig ?? {};
  const enabled =
    website.recorderEnabled && (kind === 'replays' ? config.replayEnabled : config.heatmapEnabled);

  if (enabled) return null;

  return (
    <Alert>
      <Info />
      <AlertTitle>{kind === 'replays' ? 'Session replay' : 'Heatmaps'} are turned off</AlertTitle>
      <AlertDescription>
        <p>
          New {kind === 'replays' ? 'recordings' : 'clicks and scrolls'} won&apos;t be collected
          until you turn them on and add the recorder script to your site.{' '}
          <Link
            href={`/websites/${websiteId}/settings?tab=recording`}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Open recording settings
          </Link>
        </p>
      </AlertDescription>
    </Alert>
  );
}
