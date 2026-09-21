'use client';
/*
 * Creating an API key, and showing it the one time it can be shown.
 *
 * Its own module because two places need it: the API keys page, where keys are
 * managed, and the profile page, where someone who has just been asked for a
 * key by an editor or a script is most likely to go looking. One
 * implementation, so the expiry choices and the warning cannot drift apart.
 */
import { KeyRound, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';

const DAY = 60 * 60 * 24;

const EXPIRY = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'Never' },
];

export function unwrap<T>(
  result: { data?: T | null; error?: { message?: string } | null },
  fallback: string,
) {
  if (result.error) throw new Error(result.error.message || fallback);
  return result.data as T;
}

export function CreateKey({
  onCreated,
  size = 'sm',
}: {
  onCreated: (key: string) => void;
  size?: React.ComponentProps<typeof Button>['size'];
}) {
  const [open, setOpen] = useState(false);
  const [expiry, setExpiry] = useState('90');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get('name')).trim();
    setSaving(true);

    try {
      const created = unwrap(
        await authClient.apiKey.create({
          name,
          ...(expiry !== 'never' && { expiresIn: Number(expiry) * DAY }),
        }),
        'Could not create the key',
      ) as { key: string };
      onCreated(created.key);
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the key');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size}>
          <Plus data-icon="inline-start" />
          New key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>New API key</DialogTitle>
            <DialogDescription>
              It can do anything you can. Give it a name you&apos;ll recognise later.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="key-name">Name</FieldLabel>
              <Input
                id="key-name"
                name="name"
                required
                maxLength={100}
                placeholder="Grafana"
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel>Expires after</FieldLabel>
              <Select value={expiry} onValueChange={setExpiry}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {EXPIRY.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              Create key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The key, once. Ghostwire stores only a hash, so a key that is not copied
 * here is gone — which is worth saying plainly rather than leaving someone to
 * discover it after they navigate away.
 */
export function NewKeyAlert({ value }: { value: string }) {
  return (
    <Alert>
      <KeyRound />
      <AlertTitle>Copy your new key now</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>It won&apos;t be shown again.</p>
        <InputGroup>
          <InputGroupInput value={value} readOnly className="font-mono text-xs" />
          <InputGroupAddon align="inline-end">
            <CopyButton value={value} label="Copy key" />
          </InputGroupAddon>
        </InputGroup>
      </AlertDescription>
    </Alert>
  );
}
