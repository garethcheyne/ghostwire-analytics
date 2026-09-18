'use client';
import { formatDistanceToNowStrict } from 'date-fns';
import { BellOff, BellRing, Download, Send, Share, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useChannels, useSaveChannel } from '@/hooks/queries/alerts';
import {
  usePushDevices,
  useRemovePushDevice,
  useSavePushSubscription,
  useTestPush,
} from '@/hooks/queries/push';
import {
  canInstall,
  describeDevice,
  getPushSubscription,
  getPushSupport,
  isStandalone,
  promptInstall,
  type PushSupport,
  subscribeInstallPrompt,
  subscribeToPush,
} from '@/lib/pwa';

function useInstallable() {
  return useSyncExternalStore(subscribeInstallPrompt, canInstall, () => false);
}

const noSubscribe = () => () => {};

/** Browser facts that don't change while the page is open; null while rendering on the server. */
function useBrowserValue<T>(read: () => T) {
  return useSyncExternalStore<T | null>(noSubscribe, read, () => null);
}

function SupportNotice({ support }: { support: PushSupport }) {
  if (support === 'ios-needs-install') {
    return (
      <Alert>
        <Share />
        <AlertTitle>Add it to your Home Screen first</AlertTitle>
        <AlertDescription>
          On iPhone and iPad, notifications work in the installed app: tap Share, then Add to Home
          Screen, open Ghostwire Analytics from there and come back to this page.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <BellOff />
      <AlertTitle>
        {support === 'insecure' ? 'Notifications need HTTPS' : 'Not available in this browser'}
      </AlertTitle>
      <AlertDescription>
        {support === 'insecure'
          ? 'Browsers only allow notifications on https:// addresses (and localhost). Open Ghostwire Analytics through its https address.'
          : 'This browser does not support push notifications. Try a current Chrome, Edge, Firefox or Safari.'}
      </AlertDescription>
    </Alert>
  );
}

export function PushDeviceCard() {
  const { data, isPending } = usePushDevices();
  const { data: channels } = useChannels(null);
  const saveSubscription = useSavePushSubscription();
  const saveChannel = useSaveChannel(null);
  const remove = useRemovePushDevice();
  const test = useTestPush();
  const installable = useInstallable();
  const support = useBrowserValue(getPushSupport);
  const standalone = useBrowserValue(isStandalone);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushSubscription()
      .then(subscription => setEndpoint(subscription?.endpoint ?? null))
      .catch(() => {});
  }, []);

  const devices = data?.devices ?? [];
  const enabledHere = !!endpoint && devices.some(device => device.endpoint === endpoint);

  async function handleEnable() {
    if (!data) return;
    setBusy(true);
    try {
      const subscription = await subscribeToPush(data.publicKey);
      await saveSubscription.mutateAsync(subscription.toJSON());
      setEndpoint(subscription.endpoint);

      // Alerts reach devices through a push channel; make one the first time.
      if (channels && !channels.data.some(channel => channel.type === 'push' && !channel.teamId)) {
        await saveChannel.mutateAsync({ name: 'My devices', type: 'push', config: {} });
        toast.success('Notifications are on', {
          description:
            'Added a "My devices" channel. Choose which alerts use it in each website\'s settings.',
        });
      } else {
        toast.success('Notifications are on for this device');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not turn on notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    try {
      const subscription = await getPushSubscription();
      const device = devices.find(d => d.endpoint === (subscription?.endpoint ?? endpoint));
      await subscription?.unsubscribe();
      if (device) await remove.mutateAsync(device.id);
      setEndpoint(null);
      toast.success('Notifications are off for this device');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not turn off notifications.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    const result = await test.mutateAsync().catch(e => ({
      sent: 0,
      failed: 1,
      removed: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }));
    if (result.sent) {
      toast.success(`Test sent to ${result.sent} device${result.sent === 1 ? '' : 's'}`);
    } else {
      toast.error(result.errors[0] ?? 'No devices received it. Turn notifications on again.');
    }
  }

  async function handleInstall() {
    if (await promptInstall()) toast.success('Ghostwire Analytics is installed');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>This device</CardTitle>
        <CardDescription>
          Get alerts as notifications on your phone or computer, even when Ghostwire Analytics
          isn&apos;t open.
        </CardDescription>
        {installable && !standalone && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={handleInstall}>
              <Download data-icon="inline-start" />
              Install app
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {support === null || isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : support !== 'supported' ? (
          <SupportNotice support={support} />
        ) : (
          <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                {enabledHere ? <BellRing /> : <BellOff />}
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-medium">
                  {enabledHere ? 'Notifications are on' : 'Notifications are off'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {enabledHere
                    ? 'Alerts sent to a push channel appear on this device.'
                    : 'Turn them on to receive alerts here.'}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {enabledHere ? (
                <Button variant="outline" size="sm" onClick={handleDisable} disabled={busy}>
                  {busy ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <BellOff data-icon="inline-start" />
                  )}
                  Turn off
                </Button>
              ) : (
                <Button size="sm" onClick={handleEnable} disabled={busy || !data}>
                  {busy ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <BellRing data-icon="inline-start" />
                  )}
                  Turn on notifications
                </Button>
              )}
            </div>
          </div>
        )}

        {devices.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Your devices</span>
              <Button variant="outline" size="sm" onClick={handleTest} disabled={test.isPending}>
                {test.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Send data-icon="inline-start" />
                )}
                Send a test
              </Button>
            </div>
            <ul className="flex flex-col divide-y rounded-lg border">
              {devices.map(device => (
                <li key={device.id} className="flex items-center gap-3 px-3 py-2">
                  <Smartphone className="shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-2 truncate text-sm">
                      {describeDevice(device.userAgent)}
                      {device.endpoint === endpoint && (
                        <Badge variant="secondary">This device</Badge>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      Added {formatDistanceToNowStrict(new Date(device.createdAt))} ago
                      {device.lastUsedAt &&
                        ` · last notified ${formatDistanceToNowStrict(new Date(device.lastUsedAt))} ago`}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove device"
                    onClick={() =>
                      device.endpoint === endpoint
                        ? handleDisable()
                        : remove.mutateAsync(device.id).then(() => toast.success('Device removed'))
                    }
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
