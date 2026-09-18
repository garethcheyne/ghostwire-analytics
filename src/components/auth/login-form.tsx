'use client';
import { AlertCircle, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel, FieldSeparator } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';
import { AuthHeading, safeNext } from './auth-heading';

/** Messages for the error codes Better Auth sends back after a failed SSO sign-in. */
const SSO_ERRORS: Record<string, string> = {
  signup_disabled: 'There is no Ghostwire account for that login. Ask an admin to add you.',
  email_not_found: 'Your identity provider did not share an email address.',
  account_not_linked: 'That login could not be linked to your Ghostwire account.',
};

export function LoginForm({
  next,
  ssoName,
  ssoError,
}: {
  next?: string;
  /** Set when single sign-on is configured (the button label). */
  ssoName?: string;
  ssoError?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(
    ssoError ? (SSO_ERRORS[ssoError] ?? 'Single sign-on failed. Try again.') : null,
  );
  const [pending, setPending] = useState(false);
  const [ssoPending, setSsoPending] = useState(false);

  async function handleSso() {
    setSsoPending(true);
    setError(null);

    // Redirects to the identity provider; comes back to the callback URL.
    const { error } = await authClient.signIn.social({
      provider: 'oidc' as any,
      callbackURL: safeNext(next),
      errorCallbackURL: '/login',
    });

    if (error) {
      setSsoPending(false);
      setError(error.message || 'Single sign-on failed. Try again.');
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    setPending(true);
    setError(null);

    const { data, error } = await authClient.signIn.username({
      username: String(form.get('username')),
      password: String(form.get('password')),
    });

    if (error) {
      setPending(false);
      setError(error.message || 'Incorrect username or password.');
      return;
    }

    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) {
      router.push(`/login/two-factor${next ? `?next=${encodeURIComponent(next)}` : ''}`);
      return;
    }

    router.push(safeNext(next));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="Welcome back" description="Sign in to Ghostwire Analytics" />

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <Input id="username" name="username" autoComplete="username" autoFocus required />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <Spinner data-icon="inline-start" />}
            Sign in
          </Button>
        </FieldGroup>
      </form>

      {ssoName && (
        <>
          <FieldSeparator>or</FieldSeparator>
          <Button variant="outline" size="lg" onClick={handleSso} disabled={ssoPending}>
            {ssoPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <KeyRound data-icon="inline-start" />
            )}
            Sign in with {ssoName}
          </Button>
        </>
      )}
    </div>
  );
}
