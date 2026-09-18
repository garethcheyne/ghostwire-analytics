'use client';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { CopyButton } from '@/components/copy-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '@/components/ui/input-group';
import { Switch } from '@/components/ui/switch';
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
    <div className="flex flex-col gap-6">
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
      <IdentifyUsers src={src} />
      <ProxyInjection src={src} origin={`${origin}${process.env.basePath ?? ''}`} />
    </div>
  );
}

function IdentifyUsers({ src }: { src: string }) {
  const website = useCurrentWebsite();
  const script = `// After the user logs in (and on each page load while they're logged in):
ghostwire.identify(user.username, {
  email: user.email,
  name: user.name,
});

// When they log out, go back to anonymous:
ghostwire.identify('');`;
  const attribute = `<script defer src="${src}" data-website-id="${website.id}"
  data-distinct-id="<%= user.username %>"></script>`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identify users</CardTitle>
        <CardDescription>
          Pass the logged-in username so support can look people up under{' '}
          <Link href={`/websites/${website.id}/users`} className="text-primary hover:underline">
            Users
          </Link>{' '}
          and see what they did, including replays. Only do this for sites where your privacy policy
          covers it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">From JavaScript</p>
          <InputGroup>
            <InputGroupTextarea value={script} readOnly rows={8} className="font-mono text-xs" />
            <InputGroupAddon align="block-end" className="justify-end">
              <CopyButton value={script} label="Copy identify code" />
            </InputGroupAddon>
          </InputGroup>
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Or on the script tag, for server-rendered pages</p>
          <InputGroup>
            <InputGroupTextarea value={attribute} readOnly rows={3} className="font-mono text-xs" />
            <InputGroupAddon align="block-end" className="justify-end">
              <CopyButton value={attribute} label="Copy script tag" />
            </InputGroupAddon>
          </InputGroup>
        </div>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
          <li>
            The username can be any stable ID (up to 50 characters). Other fields (email, name,
            plan) are searchable and shown on the user&apos;s page.
          </li>
          <li>
            Browsing on the same device before they logged in is linked too. People who share a
            network and browser version can share that anonymous history.
          </li>
          <li>Replays still mask inputs and text according to the recording settings.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

/** The OpenResty lines that make ghostwire-proxy add the tracker to every HTML page it serves. */
export function proxyInjectionSnippet({
  src,
  origin,
  websiteId,
  errors,
  replays,
}: {
  src: string;
  origin: string;
  websiteId: string;
  errors: boolean;
  replays: boolean;
}) {
  const tags = [
    `<script defer src="${src}" data-website-id="${websiteId}"${errors ? ' data-errors="true"' : ''}></script>`,
    ...(replays
      ? [
          `<script defer src="${origin}/recorder.js" data-website-id="${websiteId}" data-host-url="${origin}"></script>`,
        ]
      : []),
  ].join('');

  return [
    '# Ghostwire Analytics: add the tracker to every HTML page.',
    '# Ask the site for uncompressed HTML so the tag can be inserted.',
    'proxy_set_header Accept-Encoding "";',
    'sub_filter_types text/html;',
    'sub_filter_once on;',
    `sub_filter '</head>' '${tags}</head>';`,
  ].join('\n');
}

function ProxyInjection({ src, origin }: { src: string; origin: string }) {
  const website = useCurrentWebsite();
  const [errors, setErrors] = useState(true);
  const [replays, setReplays] = useState(false);
  const snippet = proxyInjectionSnippet({ src, origin, websiteId: website.id, errors, replays });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add it through ghostwire-proxy</CardTitle>
        <CardDescription>
          No changes to the site: paste this into the proxy host&apos;s{' '}
          <span className="font-medium text-foreground">Advanced</span> config in ghostwire-proxy,
          and every HTML page it serves gets the tracker.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup className="gap-3">
          <Field orientation="horizontal">
            <Switch id="inject-errors" checked={errors} onCheckedChange={setErrors} />
            <FieldLabel htmlFor="inject-errors" className="font-normal">
              Capture errors (also switch it on under Settings → Errors)
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Switch id="inject-replays" checked={replays} onCheckedChange={setReplays} />
            <FieldLabel htmlFor="inject-replays" className="font-normal">
              Session replay and heatmaps (also switch them on under Replays &amp; heatmaps)
            </FieldLabel>
          </Field>
        </FieldGroup>
        <InputGroup>
          <InputGroupTextarea value={snippet} readOnly rows={7} className="font-mono text-xs" />
          <InputGroupAddon align="block-end" className="justify-end">
            <CopyButton value={snippet} label="Copy proxy config" />
          </InputGroupAddon>
        </InputGroup>
        <p className="text-sm text-muted-foreground">
          If the site sends a Content-Security-Policy, allow {origin} in its script-src and
          connect-src.
        </p>
      </CardContent>
    </Card>
  );
}
