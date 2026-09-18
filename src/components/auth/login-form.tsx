'use client';
import { AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';
import { AuthHeading, safeNext } from './auth-heading';

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
    </div>
  );
}
