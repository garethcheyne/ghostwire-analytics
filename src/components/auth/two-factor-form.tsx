'use client';
import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';
import { AuthHeading, safeNext } from './auth-heading';

export function TwoFactorForm({ next }: { next?: string }) {
  const router = useRouter();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function verify(value: string) {
    setPending(true);
    setError(null);

    try {
      const { error } = useBackupCode
        ? await authClient.twoFactor.verifyBackupCode({ code: value, trustDevice })
        : await authClient.twoFactor.verifyTotp({ code: value, trustDevice });

      if (error) {
        setPending(false);
        setError(error.message || 'That code is not valid.');
        return;
      }

      router.push(safeNext(next));
      router.refresh();
    } catch (cause) {
      // As on the login form: a throw must not leave the form spinning in silence.
      setPending(false);
      setError(
        cause instanceof Error && cause.message
          ? `Could not verify that code: ${cause.message}`
          : 'Could not reach the server. Check that it is running, then try again.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading
        title="Two-factor authentication"
        description={
          useBackupCode
            ? 'Enter one of your backup codes.'
            : 'Enter the 6-digit code from your authenticator app.'
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={event => {
          event.preventDefault();
          verify(code);
        }}
      >
        <FieldGroup>
          {useBackupCode ? (
            <Field>
              <FieldLabel htmlFor="backup-code">Backup code</FieldLabel>
              <Input
                id="backup-code"
                value={code}
                onChange={event => setCode(event.target.value.trim())}
                autoComplete="one-time-code"
                autoFocus
              />
            </Field>
          ) : (
            <Field className="items-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={setCode}
                onComplete={verify}
                autoFocus
                disabled={pending}
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map(index => (
                    <InputOTPSlot key={index} index={index} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </Field>
          )}
          <Field orientation="horizontal">
            <Checkbox
              id="trust-device"
              checked={trustDevice}
              onCheckedChange={checked => setTrustDevice(checked === true)}
            />
            <FieldLabel htmlFor="trust-device" className="font-normal">
              Trust this device for 30 days
            </FieldLabel>
          </Field>
          <Button type="submit" size="lg" disabled={pending || !code}>
            {pending && <Spinner data-icon="inline-start" />}
            Verify
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              setUseBackupCode(value => !value);
              setCode('');
              setError(null);
            }}
          >
            {useBackupCode ? 'Use authenticator app instead' : 'Use a backup code instead'}
          </Button>
        </FieldGroup>
      </form>
    </div>
  );
}
