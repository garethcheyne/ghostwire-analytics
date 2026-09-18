'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
import { PageHeader } from '@/components/page-header';
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { authClient } from '@/lib/auth-client';

interface ApiKeyRow {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  createdAt: string | Date;
  expiresAt: string | Date | null;
  lastRequest: string | Date | null;
}

const DAY = 60 * 60 * 24;
const EXPIRY = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'Never' },
];

function unwrap<T>(
  result: { data?: T | null; error?: { message?: string } | null },
  fallback: string,
) {
  if (result.error) throw new Error(result.error.message || fallback);
  return result.data as T;
}

function CreateKey({ onCreated }: { onCreated: (key: string) => void }) {
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
        <Button size="sm">
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

export function ApiKeysSettings() {
  const queryClient = useQueryClient();
  const [newKey, setNewKey] = useState<string | null>(null);
  const { data: keys, isPending } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const result = unwrap(await authClient.apiKey.list(), 'Could not load keys') as
        ApiKeyRow[] | { apiKeys: ApiKeyRow[] };
      return Array.isArray(result) ? result : result.apiKeys;
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });

  async function remove(keyId: string) {
    try {
      unwrap(await authClient.apiKey.delete({ keyId }), 'Could not delete the key');
      toast.success('Key deleted');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the key');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="API keys"
        description="Use the Ghostwire API from scripts and other tools."
      />
      {newKey && (
        <Alert>
          <KeyRound />
          <AlertTitle>Copy your new key now</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>It won&apos;t be shown again.</p>
            <InputGroup>
              <InputGroupInput value={newKey} readOnly className="font-mono text-xs" />
              <InputGroupAddon align="inline-end">
                <CopyButton value={newKey} label="Copy key" />
              </InputGroupAddon>
            </InputGroup>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
          <CardDescription>
            Send as <code className="font-mono">Authorization: Bearer gwa_…</code>.
          </CardDescription>
          <CardAction>
            <CreateKey
              onCreated={key => {
                setNewKey(key);
                refresh();
              }}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : !keys?.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRound />
                </EmptyMedia>
                <EmptyTitle>No API keys</EmptyTitle>
                <EmptyDescription>Create one to call the API from another tool.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="hidden md:table-cell">Last used</TableHead>
                  <TableHead className="hidden md:table-cell">Expires</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map(key => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name || 'Unnamed'}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {key.start ?? key.prefix ?? 'gwa_'}…
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {key.lastRequest
                        ? formatDistanceToNowStrict(new Date(key.lastRequest), { addSuffix: true })
                        : 'Never'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {key.expiresAt ? format(new Date(key.expiresAt), 'd MMM yyyy') : 'Never'}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Delete key">
                            <Trash2 />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete “{key.name || 'Unnamed'}”?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Anything using this key stops working straight away.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => remove(key.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
