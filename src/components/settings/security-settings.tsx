'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Monitor, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';

type AuthResult<T = unknown> = { data?: T | null; error?: { message?: string } | null };

function unwrap<T>(result: AuthResult<T>, fallback: string): T {
  if (result.error) throw new Error(result.error.message || fallback);
  return result.data as T;
}

function ChangePassword() {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get('new'));
    setError(null);

    if (newPassword !== String(form.get('confirm'))) {
      setError("The new passwords don't match.");
      return;
    }

    setSaving(true);
    try {
      unwrap(
        await authClient.changePassword({
          currentPassword: String(form.get('current')),
          newPassword,
          revokeOtherSessions: true,
        }),
        'Could not change your password.',
      );
      formElement.reset();
      toast.success('Password changed. Other devices were signed out.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Changing it signs you out everywhere else.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="max-w-xl">
            <Field>
              <FieldLabel htmlFor="password-current">Current password</FieldLabel>
              <Input
                id="password-current"
                name="current"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password-new">New password</FieldLabel>
              <Input
                id="password-new"
                name="new"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
              <FieldDescription>At least 8 characters.</FieldDescription>
            </Field>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="password-confirm">Confirm new password</FieldLabel>
              <Input
                id="password-confirm"
                name="confirm"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                aria-invalid={!!error || undefined}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={saving}>
            {saving && <Spinner data-icon="inline-start" />}
            Change password
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

type Setup = { totpURI: string; backupCodes: string[] };

function TwoFactorSetup({ setup, onDone }: { setup: Setup; onDone: () => void }) {
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const secret = new URL(setup.totpURI).searchParams.get('secret') ?? '';

  useEffect(() => {
    QRCode.toString(setup.totpURI, { type: 'svg', margin: 1, width: 192 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [setup.totpURI]);

  async function verify() {
    setError(null);
    setSaving(true);
    try {
      unwrap(await authClient.twoFactor.verifyTotp({ code }), 'That code is not right.');
      setVerified(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code is not right.');
    } finally {
      setSaving(false);
    }
  }

  if (verified) {
    const codes = setup.backupCodes.join('\n');

    return (
      <>
        <DialogHeader>
          <DialogTitle>Save your backup codes</DialogTitle>
          <DialogDescription>
            Each code works once, if you lose your authenticator. They won&apos;t be shown again.
          </DialogDescription>
        </DialogHeader>
        <pre className="grid grid-cols-2 gap-2 rounded-md bg-muted p-4 font-mono text-sm">
          {setup.backupCodes.map(backup => (
            <span key={backup}>{backup}</span>
          ))}
        </pre>
        <DialogFooter>
          <CopyButton value={codes} label="Copy backup codes" />
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Set up two-factor authentication</DialogTitle>
        <DialogDescription>
          Scan this with an authenticator app (1Password, Google Authenticator, Authy…), then enter
          the 6-digit code it shows.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col items-center gap-4">
        {qr ? (
          <div
            className="rounded-md bg-white p-2"
            // The SVG is generated locally from the TOTP URI.
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        ) : (
          <Skeleton className="size-48" />
        )}
        <p className="text-center text-xs text-muted-foreground">
          Can&apos;t scan? Enter this key: <code className="font-mono break-all">{secret}</code>
        </p>
        <Field data-invalid={!!error || undefined} className="items-center">
          <InputOTP maxLength={6} value={code} onChange={setCode} aria-label="Code">
            <InputOTPGroup>
              {Array.from({ length: 6 }, (_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
          {error && <FieldError>{error}</FieldError>}
        </Field>
      </div>
      <DialogFooter>
        <Button onClick={verify} disabled={code.length !== 6 || saving}>
          {saving && <Spinner data-icon="inline-start" />}
          Verify and turn on
        </Button>
      </DialogFooter>
    </>
  );
}

function TwoFactor() {
  const { data: session, refetch } = authClient.useSession();
  const enabled = !!(session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled;
  const [mode, setMode] = useState<'enable' | 'disable' | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setMode(null);
    setSetup(null);
    setError(null);
    void refetch();
  };

  async function confirmPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password'));
    setError(null);
    setSaving(true);

    try {
      if (mode === 'enable') {
        setSetup(
          unwrap(
            await authClient.twoFactor.enable({ password }),
            'Could not start two-factor setup.',
          ) as Setup,
        );
      } else {
        unwrap(await authClient.twoFactor.disable({ password }), 'Could not turn it off.');
        toast.success('Two-factor authentication turned off');
        close();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Two-factor authentication
          {enabled ? <Badge>On</Badge> : <Badge variant="secondary">Off</Badge>}
        </CardTitle>
        <CardDescription>
          Ask for a code from an authenticator app when you sign in, as well as your password.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        {enabled ? (
          <Button variant="outline" onClick={() => setMode('disable')}>
            <ShieldAlert data-icon="inline-start" />
            Turn off
          </Button>
        ) : (
          <Button onClick={() => setMode('enable')}>
            <ShieldCheck data-icon="inline-start" />
            Turn on
          </Button>
        )}
      </CardFooter>

      <Dialog open={mode !== null} onOpenChange={open => !open && close()}>
        <DialogContent className="sm:max-w-md">
          {setup ? (
            <TwoFactorSetup
              setup={setup}
              onDone={() => {
                toast.success('Two-factor authentication is on');
                close();
              }}
            />
          ) : (
            <form onSubmit={confirmPassword} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>
                  {mode === 'enable' ? 'Turn on two-factor' : 'Turn off two-factor'}
                </DialogTitle>
                <DialogDescription>Confirm your password to continue.</DialogDescription>
              </DialogHeader>
              <Field data-invalid={!!error || undefined}>
                <FieldLabel htmlFor="twofactor-password">Password</FieldLabel>
                <Input
                  id="twofactor-password"
                  name="password"
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  aria-invalid={!!error || undefined}
                />
                {error && <FieldError>{error}</FieldError>}
              </Field>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={mode === 'disable' ? 'destructive' : 'default'}
                  disabled={saving}
                >
                  {saving && <Spinner data-icon="inline-start" />}
                  Continue
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

interface AuthSessionRow {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

function describeAgent(userAgent?: string | null) {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /Firefox\//.test(userAgent)
      ? 'Firefox'
      : /Chrome\//.test(userAgent)
        ? 'Chrome'
        : /Safari\//.test(userAgent)
          ? 'Safari'
          : 'Browser';
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /iPhone|iPad/.test(userAgent)
      ? 'iOS'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Mac OS X/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : '';
  return [browser, os].filter(Boolean).join(' on ');
}

function Sessions() {
  const queryClient = useQueryClient();
  const { data: current } = authClient.useSession();
  const { data: sessions, isPending } = useQuery({
    queryKey: ['auth-sessions'],
    queryFn: async () =>
      unwrap(await authClient.listSessions(), 'Could not load sessions') as AuthSessionRow[],
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['auth-sessions'] });

  async function revoke(token: string) {
    try {
      unwrap(await authClient.revokeSession({ token }), 'Could not sign it out');
      toast.success('Signed out');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not sign it out');
    }
  }

  async function revokeOthers() {
    try {
      unwrap(await authClient.revokeOtherSessions(), 'Could not sign them out');
      toast.success('Signed out everywhere else');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not sign them out');
    }
  }

  const others = (sessions ?? []).filter(row => row.token !== current?.session.token);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Signed-in devices</CardTitle>
        <CardDescription>Sign out anything you don&apos;t recognise.</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="flex flex-col divide-y">
            {(sessions ?? []).map(row => {
              const isCurrent = row.token === current?.session.token;
              const Icon = /iPhone|Android|Mobile/.test(row.userAgent ?? '') ? Smartphone : Monitor;

              return (
                <li key={row.id} className="flex items-center gap-3 py-3">
                  <Icon className="size-4 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">
                      {describeAgent(row.userAgent)}
                      {isCurrent && (
                        <Badge variant="secondary" className="ml-2">
                          This device
                        </Badge>
                      )}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {row.ipAddress || 'Unknown IP'} · active{' '}
                      {formatDistanceToNowStrict(new Date(row.updatedAt), { addSuffix: true })}
                    </span>
                  </div>
                  {!isCurrent && (
                    <Button variant="outline" size="sm" onClick={() => revoke(row.token)}>
                      Sign out
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      {others.length > 0 && (
        <CardFooter>
          <Button variant="outline" onClick={revokeOthers}>
            Sign out all other devices
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

export function SecuritySettings({ twoFactorRequired }: { twoFactorRequired?: boolean }) {
  const { data: session } = authClient.useSession();
  const enabled = !!(session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Security" description="Your password, two-factor and signed-in devices." />
      {twoFactorRequired && !enabled && (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>Two-factor authentication is required</AlertTitle>
          <AlertDescription>
            Your administrator requires it. Turn it on below to keep using Ghostwire.
          </AlertDescription>
        </Alert>
      )}
      <TwoFactor />
      <ChangePassword />
      <Sessions />
    </div>
  );
}
