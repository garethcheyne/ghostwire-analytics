'use client';
import { useSyncExternalStore } from 'react';
import { CopyButton } from '@/components/copy-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { useAppConfig } from '@/hooks/queries/config';
import { useCurrentWebsite } from '../website-context';

const DEFAULT_SCRIPT = 'script.js';

// The app's own origin, read on the client (the snippet points back at this server).
const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => '';

const OPTIONS = [
  ['data-domains="example.com,www.example.com"', 'Only track on these hostnames.'],
  ['data-auto-track="false"', 'Turn off automatic pageviews; call ghostwire.track() yourself.'],
  ['data-exclude-search="true"', 'Drop query strings from recorded URLs.'],
  ['data-ghostwire-event="signup"', 'On any element: record a click as a custom event.'],
];

export function TrackingCode() {
  const website = useCurrentWebsite();
  const { data: config } = useAppConfig();
  const origin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);

  const scriptName =
    config?.trackerScriptName
      ?.split(',')
      .map(name => name.trim())
      .find(Boolean) || DEFAULT_SCRIPT;
  const src = scriptName.startsWith('http')
    ? scriptName
    : `${origin}${process.env.basePath ?? ''}/${scriptName.replace(/^\/+/, '')}`;
  const code = `<script defer src="${src}" data-website-id="${website.id}"></script>`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tracking code</CardTitle>
        <CardDescription>
          Add this to the <code className="font-mono">&lt;head&gt;</code> of every page on{' '}
          {website.domain ?? 'your site'}. No cookies are set.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <InputGroup>
          <InputGroupTextarea value={code} readOnly rows={3} className="font-mono text-xs" />
          <InputGroupAddon align="block-end" className="justify-end">
            <CopyButton value={code} label="Copy tracking code" />
          </InputGroupAddon>
        </InputGroup>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Optional attributes</p>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            {OPTIONS.map(([attribute, description]) => (
              <li key={attribute} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <code className="shrink-0 font-mono text-xs text-foreground">{attribute}</code>
                <span>{description}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
