'use client';
/*
 * How to connect an AI agent to this instance over MCP.
 *
 * The endpoint and every snippet on this page are built from the URL the
 * browser is actually on, not from a configured value: someone reading this
 * has reached the instance, so that address is known to work. A page that
 * tells people to paste a host they then have to guess is worse than no page.
 */
import { useState, useSyncExternalStore } from 'react';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KeyRound } from 'lucide-react';
import { CreateKey, NewKeyAlert } from './create-api-key';

/**
 * The instance's own origin. Read through useSyncExternalStore so the server
 * render and the first client render agree — reading window during render
 * directly would mismatch and warn.
 */
function useOrigin() {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  );
}

const TOOLS = [
  ['ghostwire_list_websites', 'The sites this key can see'],
  ['ghostwire_create_website', 'Add a site and get its tracking snippet'],
  ['ghostwire_get_website', 'One site, with its snippet and settings'],
  ['ghostwire_update_website', 'Rename, change domain, toggle errors and replay'],
  ['ghostwire_create_error_key', 'Issue the gwe_ key for server-side errors'],
  ['ghostwire_get_stats', 'Visitors, views, bounce rate, with the period before'],
  ['ghostwire_get_metrics', 'Top pages, referrers, countries, browsers, channels'],
  ['ghostwire_get_timeseries', 'Traffic per hour, day or month'],
  ['ghostwire_get_active_visitors', 'People on the site right now'],
];

export function McpSettings() {
  const origin = useOrigin();
  const [newKey, setNewKey] = useState<string | null>(null);
  const endpoint = `${origin}/api/mcp`;
  const key = newKey ?? 'gwa_your_api_key';

  const claudeCode = `claude mcp add ghostwire --transport http \\
  ${endpoint} \\
  --header "Authorization: Bearer ${key}"`;

  const jsonConfig = JSON.stringify(
    {
      mcpServers: {
        ghostwire: {
          type: 'http',
          url: endpoint,
          headers: { Authorization: `Bearer ${key}` },
        },
      },
    },
    null,
    2,
  );

  const bridgeConfig = JSON.stringify(
    {
      mcpServers: {
        ghostwire: {
          command: 'npx',
          args: ['-y', '@ghostwire/mcp'],
          env: { GHOSTWIRE_HOST: origin, GHOSTWIRE_API_KEY: key },
        },
      },
    },
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="AI agents (MCP)"
        description="Let an agent in your editor set up a site and read how it is doing, against this instance."
      />

      {newKey && <NewKeyAlert value={newKey} />}

      <Card>
        <CardHeader>
          <CardTitle>1. Create an API key</CardTitle>
          <CardDescription>
            The agent authenticates as you, and can do anything you can. Give it its own key so you
            can revoke it without affecting anything else.
          </CardDescription>
          <CardAction>
            <CreateKey onCreated={setNewKey} />
          </CardAction>
        </CardHeader>
        <CardContent>
          {newKey ? (
            <p className="text-sm text-muted-foreground">
              The snippets below now carry your new key. Copy one before you leave this page — the
              key is not shown again.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              The snippets below show{' '}
              <code className="font-mono text-xs">gwa_your_api_key</code> until you create one.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Point your editor at this instance</CardTitle>
          <CardDescription>
            The endpoint is <code className="font-mono text-xs">{endpoint}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="claude-code">
            <TabsList>
              <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
              <TabsTrigger value="json">Claude Desktop, Cursor, VS Code</TabsTrigger>
              <TabsTrigger value="stdio">Older clients</TabsTrigger>
            </TabsList>

            <TabsContent value="claude-code" className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">Run this in your project:</p>
              <InputGroup>
                <InputGroupTextarea
                  value={claudeCode}
                  readOnly
                  rows={3}
                  className="font-mono text-xs"
                  aria-label="Claude Code command"
                />
                <InputGroupAddon align="block-end" className="justify-end">
                  <CopyButton value={claudeCode} label="Copy command" />
                </InputGroupAddon>
              </InputGroup>
            </TabsContent>

            <TabsContent value="json" className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Add this to the client&apos;s MCP configuration file.
              </p>
              <InputGroup>
                <InputGroupTextarea
                  value={jsonConfig}
                  readOnly
                  rows={11}
                  className="font-mono text-xs"
                  aria-label="MCP JSON configuration"
                />
                <InputGroupAddon align="block-end" className="justify-end">
                  <CopyButton value={jsonConfig} label="Copy configuration" />
                </InputGroupAddon>
              </InputGroup>
            </TabsContent>

            <TabsContent value="stdio" className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                For clients that cannot reach a remote MCP endpoint,{' '}
                <code className="font-mono text-xs">@ghostwire/mcp</code> bridges this same
                endpoint over stdio. Everything above is preferred where it works — the bridge is
                an extra moving part, not an extra feature.
              </p>
              <InputGroup>
                <InputGroupTextarea
                  value={bridgeConfig}
                  readOnly
                  rows={12}
                  className="font-mono text-xs"
                  aria-label="Bridge configuration"
                />
                <InputGroupAddon align="block-end" className="justify-end">
                  <CopyButton value={bridgeConfig} label="Copy configuration" />
                </InputGroupAddon>
              </InputGroup>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Ask it for something</CardTitle>
          <CardDescription>
            Try &ldquo;list my Ghostwire sites&rdquo;, or &ldquo;add analytics to this app&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {TOOLS.map(([name, what]) => (
              <div key={name} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <code className="font-mono text-xs text-foreground">{name}</code>
                <span className="text-sm text-muted-foreground">{what}</span>
              </div>
            ))}
          </div>

          <Separator />

          <p className="text-sm text-muted-foreground">
            Teams, users, alerts and deleting things are deliberately not exposed, so a bad prompt
            cannot do lasting damage through this door.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Writing the integration</CardTitle>
          <CardDescription>
            The MCP server creates the site. The <code className="font-mono text-xs">ghostwire-analytics</code>{' '}
            skill tells the agent how to wire it into a codebase.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            It covers Next.js, React, plain HTML and server-side error reporting — including the
            things that quietly stop data arriving, like forgetting{' '}
            <code className="font-mono text-xs">connect-src</code> in a Content-Security-Policy.
            Copy it from the <code className="font-mono text-xs">skills/</code> folder of the
            Ghostwire repository into your project:
          </p>
          <InputGroup className="max-w-2xl">
            <InputGroupInput
              value="cp -r skills/ghostwire-analytics your-project/.claude/skills/"
              readOnly
              className="font-mono text-xs"
              aria-label="Copy the skill into a project"
            />
            <InputGroupAddon align="inline-end">
              <CopyButton
                value="cp -r skills/ghostwire-analytics your-project/.claude/skills/"
                label="Copy command"
              />
            </InputGroupAddon>
          </InputGroup>
        </CardContent>
      </Card>

      <Alert>
        <KeyRound />
        <AlertTitle>A key is as powerful as your account</AlertTitle>
        <AlertDescription>
          An agent holding one can read every site you can see and create new ones. Revoke it under
          API keys when you are done with it, and give a key an expiry unless you have a reason
          not to.
        </AlertDescription>
      </Alert>
    </div>
  );
}
