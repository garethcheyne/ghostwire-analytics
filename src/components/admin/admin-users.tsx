'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from '@/components/ui/field';
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
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, type PageResult } from '@/lib/api-client';
import { authClient } from '@/lib/auth-client';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: string;
  createdAt: string;
  twoFactorEnabled: boolean | null;
  twoFactorRequired: boolean | null;
  _count: { websites: number };
}

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrator', description: 'Everything, including these settings.' },
  { value: 'user', label: 'User', description: 'Their own websites and teams.' },
  { value: 'viewer', label: 'View only', description: 'Can view, not change.' },
];

const roleLabel = (role: string) =>
  ROLE_OPTIONS.find(option => option.value === role)?.label ?? role;

function UserDialog({ user, trigger }: { user?: AdminUser; trigger: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(user?.role ?? 'user');
  const [requireTwoFactor, setRequireTwoFactor] = useState(!!user?.twoFactorRequired);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      user ? api.post(`/users/${user.id}`, body) : api.post('/users', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }),
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    setError(null);

    try {
      await save.mutateAsync({
        username: String(form.get('username')).trim(),
        name: String(form.get('name')).trim() || undefined,
        email: String(form.get('email')).trim(),
        role,
        ...(password && { password }),
        ...(user && { twoFactorRequired: requireTwoFactor }),
      });
      toast.success(user ? 'User saved' : 'User created');
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the user.');
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{user ? `Edit ${user.username ?? user.name}` : 'New user'}</DialogTitle>
            <DialogDescription>
              {user
                ? 'Setting a new password signs them out everywhere.'
                : 'They sign in with the username and password you set here.'}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="user-username">Username</FieldLabel>
                <Input
                  id="user-username"
                  name="username"
                  required
                  maxLength={255}
                  defaultValue={user?.username ?? ''}
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="user-name">Name</FieldLabel>
                <Input id="user-name" name="name" maxLength={255} defaultValue={user?.name ?? ''} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="user-email">Email</FieldLabel>
              <Input
                id="user-email"
                name="email"
                type="email"
                required
                defaultValue={user?.email ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="user-password">{user ? 'New password' : 'Password'}</FieldLabel>
              <Input
                id="user-password"
                name="password"
                type="password"
                minLength={8}
                required={!user}
                autoComplete="new-password"
                placeholder={user ? 'Leave blank to keep' : undefined}
              />
            </Field>
            <Field>
              <FieldLabel>Role</FieldLabel>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {ROLE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                        <span className="text-muted-foreground"> · {option.description}</span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            {user && (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Require two-factor</FieldTitle>
                  <FieldDescription>
                    They must set it up before they can use Ghostwire.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  checked={requireTwoFactor}
                  onCheckedChange={setRequireTwoFactor}
                  aria-label="Require two-factor"
                />
              </Field>
            )}
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner data-icon="inline-start" />}
              {user ? 'Save' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminUsers() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());
  const { data, isPending } = useQuery({
    queryKey: ['admin', 'users', deferredSearch, page],
    queryFn: () =>
      api.get<PageResult<AdminUser>>('/admin/users', {
        search: deferredSearch,
        page,
        pageSize: 25,
      }),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api.del(`/users/${userId}`),
    onSuccess: () => {
      toast.success('User deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: error => toast.error(error.message),
  });
  const pageCount = data ? Math.max(1, Math.ceil(data.count / 25)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Everyone who can sign in to this Ghostwire.">
        <UserDialog
          trigger={
            <Button>
              <Plus data-icon="inline-start" />
              New user
            </Button>
          }
        />
      </PageHeader>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <InputGroup className="max-w-sm">
            <InputGroupInput
              placeholder="Search users"
              value={search}
              onChange={event => {
                setSearch(event.target.value);
                setPage(1);
              }}
              aria-label="Search users"
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
          {isPending ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Two-factor</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Websites</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Created</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data.map(user => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{user.username ?? user.name}</span>
                        <span className="text-xs text-muted-foreground">{user.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {roleLabel(user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {user.twoFactorEnabled ? (
                        <Badge variant="secondary">On</Badge>
                      ) : user.twoFactorRequired ? (
                        <Badge variant="destructive">Required, not set up</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">Off</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {user._count.websites}
                    </TableCell>
                    <TableCell className="hidden text-right whitespace-nowrap text-muted-foreground lg:table-cell">
                      {formatDistanceToNowStrict(new Date(user.createdAt), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <UserDialog
                          user={user}
                          trigger={
                            <Button variant="ghost" size="icon-sm" aria-label="Edit user">
                              <Pencil />
                            </Button>
                          }
                        />
                        {user.id !== session?.user.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Delete user">
                                <Trash2 />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete {user.username ?? user.name}?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Their websites and all of their data are deleted too. This
                                  can&apos;t be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={() => remove.mutate(user.id)}
                                >
                                  Delete user
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {pageCount > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
              <span>
                Page {page} of {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pageCount}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
