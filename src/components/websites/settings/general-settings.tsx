'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';
import { useUpdateWebsite } from '@/hooks/queries/websites';
import { useCurrentWebsite } from '../website-context';

export function GeneralSettings() {
  const router = useRouter();
  const website = useCurrentWebsite();
  const updateWebsite = useUpdateWebsite(website.id);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);

    try {
      await updateWebsite.mutateAsync({
        name: String(form.get('name')).trim(),
        domain: String(form.get('domain'))
          .trim()
          .replace(/^https?:\/\//i, '')
          .replace(/\/+$/, ''),
      });
      toast.success('Website saved');
      // The layout reads the website on the server; refresh it so the header updates.
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the website.');
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>The name shown in Ghostwire and the domain you track.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="max-w-xl">
            <Field>
              <FieldLabel htmlFor="website-id">Website ID</FieldLabel>
              <InputGroup>
                <InputGroupInput id="website-id" value={website.id} readOnly className="font-mono" />
                <InputGroupAddon align="inline-end">
                  <CopyButton value={website.id} label="Copy website ID" />
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-name">Name</FieldLabel>
              <Input
                id="settings-name"
                name="name"
                defaultValue={website.name}
                maxLength={100}
                required
                disabled={!website.canUpdate}
              />
            </Field>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="settings-domain">Domain</FieldLabel>
              <Input
                id="settings-domain"
                name="domain"
                defaultValue={website.domain ?? ''}
                maxLength={500}
                required
                disabled={!website.canUpdate}
                aria-invalid={!!error || undefined}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
        </CardContent>
        {website.canUpdate && (
          <CardFooter>
            <Button type="submit" disabled={updateWebsite.isPending}>
              {updateWebsite.isPending && <Spinner data-icon="inline-start" />}
              Save
            </Button>
          </CardFooter>
        )}
      </form>
    </Card>
  );
}
