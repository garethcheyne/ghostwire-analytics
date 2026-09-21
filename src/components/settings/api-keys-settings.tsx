'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { KeyRound, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { authClient } from '@/lib/auth-client';
import { CreateKey, NewKeyAlert, unwrap } from './create-api-key';

interface ApiKeyRow {
  id: string;
  name: string | null;
  start: string | null;
  prefix: string | null;
  createdAt: string | Date;
  expiresAt: string | Date | null;
  lastRequest: string | Date | null;
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
      {newKey && <NewKeyAlert value={newKey} />}
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
