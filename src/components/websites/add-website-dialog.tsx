'use client';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useCreateWebsite } from '@/hooks/queries/websites';

// Same rule as the API (DOMAIN_REGEX): a hostname, optionally with a path.
function normalizeDomain(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

export function AddWebsiteDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const createWebsite = useCreateWebsite();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);

    try {
      const website = await createWebsite.mutateAsync({
        name: String(form.get('name')).trim(),
        domain: normalizeDomain(String(form.get('domain'))),
      });

      toast.success(`${website.name} added`);
      setOpen(false);
      router.push(`/websites/${website.id}/settings?tab=tracking`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add the website.');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={value => {
        setOpen(value);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          Add website
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Add website</DialogTitle>
            <DialogDescription>
              You&apos;ll get a tracking snippet to add to the site next.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="website-name">Name</FieldLabel>
              <Input id="website-name" name="name" placeholder="My site" maxLength={100} required />
            </Field>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="website-domain">Domain</FieldLabel>
              <Input
                id="website-domain"
                name="domain"
                placeholder="example.com"
                maxLength={500}
                required
                aria-invalid={!!error || undefined}
              />
              {error ? (
                <FieldError>{error}</FieldError>
              ) : (
                <FieldDescription>Without https://, e.g. example.com</FieldDescription>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createWebsite.isPending}>
              {createWebsite.isPending && <Spinner data-icon="inline-start" />}
              Add website
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
