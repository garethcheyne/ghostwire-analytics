'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, TriangleAlert } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldTitle } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupTextarea,
} from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUpdateWebsite, useWebsite, websiteKeys } from '@/hooks/queries/websites';
import { api } from '@/lib/api-client';
import { useCurrentWebsite } from '../website-context';

const subscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => '';

function Snippet({ value, rows, label }: { value: string; rows: number; label: string }) {
  return (
    <InputGroup>
      <InputGroupTextarea value={value} readOnly rows={rows} className="font-mono text-xs" />
      <InputGroupAddon align="block-end" className="justify-end">
        <CopyButton value={value} label={label} />
      </InputGroupAddon>
    </InputGroup>
  );
}

function IngestKey({ hint }: { hint: string | null }) {
  const website = useCurrentWebsite();
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: websiteKeys.all });

  const create = useMutation({
    mutationFn: () => api.post<{ key: string }>(`/websites/${website.id}/error-key`),
    onSuccess: ({ key }) => {
      setNewKey(key);
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: () => api.del(`/websites/${website.id}/error-key`),
    onSuccess: () => {
      setNewKey(null);
      toast.success('Key revoked');
      refresh();
    },
    onError: error => toast.error(error.message),
  });

  return (
    <div className="flex flex-col gap-3">
      {newKey && (
        <Alert>
          <KeyRound />
          <AlertTitle>Copy this key now</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>
              It won&apos;t be shown again. Store it as a secret on your server, e.g.
              GHOSTWIRE_ERROR_KEY.
            </p>
            <InputGroup>
              <InputGroupInput value={newKey} readOnly className="font-mono text-xs" />
              <InputGroupAddon align="inline-end">
                <CopyButton value={newKey} label="Copy key" />
              </InputGroupAddon>
            </InputGroup>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {hint ? (
            <>
              Current key ends in <code className="font-mono text-foreground">…{hint}</code>.
            </>
          ) : (
            'No key yet. Server clients need one to send errors.'
          )}
        </p>
        {website.canUpdate && (
          <div className="flex gap-2">
            {hint ? (
              <>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={create.isPending}>
                      Replace key
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Replace the ingest key?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Servers using the current key stop being able to send errors until you give
                        them the new one.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => create.mutate()}>Replace</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={revoke.isPending}>
                      Revoke
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Revoke the ingest key?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Server errors are rejected until you create a new key. Browser errors
                        aren&apos;t affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => revoke.mutate()}>
                        Revoke
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
                <KeyRound data-icon="inline-start" />
                Create key
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ErrorSettings() {
  const website = useCurrentWebsite();
  const { data } = useWebsite(website.id);
  const updateWebsite = useUpdateWebsite(website.id);
  const origin = useSyncExternalStore(subscribe, getOrigin, getServerOrigin);

  if (!data) return <Skeleton className="h-96 w-full" />;

  const toggle = (errorsEnabled: boolean) =>
    updateWebsite.mutate(
      { errorsEnabled },
      {
        onSuccess: () =>
          toast.success(
            errorsEnabled ? 'Error reporting switched on' : 'Error reporting switched off',
          ),
        onError: error => toast.error(error.message),
      },
    );

  const scriptTag = `<script defer src="${origin}/script.js" data-website-id="${website.id}"
  data-errors="true"></script>`;
  const manual = `try {
  await placeOrder(cart);
} catch (error) {
  ghostwire.error(error, { orderId: cart.id });
  throw error; // keep your own handling
}`;
  const react = `import { GhostwireProvider } from '@ghostwire/react';

<GhostwireProvider
  host="${origin}"
  websiteId="${website.id}"
  errors
  user={user && { id: user.username, email: user.email, name: user.name }}
>
  <App />
</GhostwireProvider>

// Optional, React 19: also report errors your error boundaries catch.
import { ghostwireRootOptions } from '@ghostwire/react';
createRoot(container, ghostwireRootOptions()).render(<Root />);`;
  const node = `import { init, captureException, errorHandler } from '@ghostwire/node';

init({
  host: '${origin}',
  websiteId: '${website.id}',
  key: process.env.GHOSTWIRE_ERROR_KEY,
  environment: process.env.NODE_ENV,
  release: process.env.APP_VERSION,
});

// Express: after your routes. Reports, then passes the error on unchanged.
app.use(errorHandler());

// Next.js: in instrumentation.ts
export { onRequestError } from '@ghostwire/node/next';

// Anywhere, for errors you handle yourself:
captureException(error, { user: { id: user.username }, request: req });`;
  const curl = `curl -X POST ${origin}/api/errors \\
  -H "Authorization: Bearer $GHOSTWIRE_ERROR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "website": "${website.id}",
    "platform": "csharp",
    "error": { "type": "NullReferenceException", "message": "...", "stack": "..." },
    "user": { "id": "jane" },
    "request": { "method": "POST", "url": "/orders/checkout" },
    "environment": "production",
    "release": "2.4.1"
  }'`;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Error reporting</CardTitle>
          <CardDescription>
            Group JavaScript and server errors, see who hit them and what they did first, and watch
            the replay. Capture only observes: it never changes how the site handles an error.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field orientation="horizontal" className="max-w-2xl">
            <FieldContent>
              <FieldTitle>Accept error reports</FieldTitle>
              <FieldDescription>
                While off, reports from the browser and servers are ignored, so you can stop them
                without redeploying the site.
              </FieldDescription>
            </FieldContent>
            <Switch
              checked={data.errorsEnabled}
              onCheckedChange={toggle}
              disabled={!website.canUpdate || updateWebsite.isPending}
              aria-label="Accept error reports"
            />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Browser errors</CardTitle>
          <CardDescription>
            Uncaught errors and rejected promises, with the clicks, page views and failed requests
            leading up to them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="react">
            <TabsList>
              <TabsTrigger value="react">React</TabsTrigger>
              <TabsTrigger value="script">Script tag</TabsTrigger>
            </TabsList>
            <TabsContent value="react" className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                <code className="font-mono">npm install @ghostwire/react</code>, then wrap your app.
              </p>
              <Snippet value={react} rows={16} label="Copy React setup" />
            </TabsContent>
            <TabsContent value="script" className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Add <code className="font-mono">data-errors=&quot;true&quot;</code> to the tracking
                script.
              </p>
              <Snippet value={scriptTag} rows={2} label="Copy script tag" />
              <p className="text-sm text-muted-foreground">
                Report errors you catch yourself with{' '}
                <code className="font-mono">ghostwire.error()</code>:
              </p>
              <Snippet value={manual} rows={6} label="Copy example" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Server errors</CardTitle>
          <CardDescription>
            Servers send errors to <code className="font-mono">/api/errors</code> with this
            website&apos;s ingest key.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <IngestKey hint={data.errorKeyHint} />
          <Tabs defaultValue="node">
            <TabsList>
              <TabsTrigger value="node">Node</TabsTrigger>
              <TabsTrigger value="http">Any language (HTTP)</TabsTrigger>
            </TabsList>
            <TabsContent value="node" className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                <code className="font-mono">npm install @ghostwire/node</code>. It watches for
                crashes without changing them: your process still exits as it would have.
              </p>
              <Snippet value={node} rows={20} label="Copy Node setup" />
            </TabsContent>
            <TabsContent value="http" className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                For Python, .NET and anything else until a client library exists. Stack traces in
                Python and .NET formats are parsed automatically.
              </p>
              <Snippet value={curl} rows={14} label="Copy HTTP example" />
            </TabsContent>
          </Tabs>
          {!data.errorsEnabled && (
            <Alert>
              <TriangleAlert />
              <AlertDescription>
                Error reporting is switched off above, so reports will be ignored.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
