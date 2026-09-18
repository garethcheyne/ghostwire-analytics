'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';

export function ProfileSettings() {
  const router = useRouter();
  const { data: session, isPending, refetch } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (isPending || !session) return <Skeleton className="h-80 w-full" />;

  const { user } = session;
  const username = (user as { username?: string }).username ?? '';
  const isAdmin = (user as { role?: string }).role === 'admin';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setSaving(true);

    try {
      await api.post(`/users/${user.id}`, {
        name: String(form.get('name')).trim(),
        ...(isAdmin && { username: String(form.get('username')).trim() }),
        email: String(form.get('email')).trim(),
      });
      await refetch();
      router.refresh();
      toast.success('Profile saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Profile" description="How you appear in Ghostwire and how you sign in." />
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <CardHeader>
            <CardTitle>Your details</CardTitle>
            <CardDescription>You sign in with your username.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="max-w-xl">
              <Field>
                <FieldLabel htmlFor="profile-name">Name</FieldLabel>
                <Input id="profile-name" name="name" defaultValue={user.name} maxLength={255} />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-username">Username</FieldLabel>
                <Input
                  id="profile-username"
                  name="username"
                  defaultValue={username}
                  maxLength={255}
                  required
                  autoComplete="username"
                  disabled={!isAdmin}
                />
                {!isAdmin && (
                  <FieldDescription>Ask an administrator to change your username.</FieldDescription>
                )}
              </Field>
              <Field data-invalid={!!error || undefined}>
                <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                <Input
                  id="profile-email"
                  name="email"
                  type="email"
                  defaultValue={user.email}
                  required
                  autoComplete="email"
                  aria-invalid={!!error || undefined}
                />
                <FieldDescription>
                  Used for account notices. Not shown to other users.
                </FieldDescription>
                {error && <FieldError>{error}</FieldError>}
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              Save
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
