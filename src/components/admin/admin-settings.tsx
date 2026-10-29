'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldContent, FieldDescription, FieldTitle } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api-client';

interface AdminSettings {
  requireTwoFactor: boolean;
  selfMonitoring: {
    enabled: boolean;
    website: { id: string; name: string } | null;
    available: boolean;
  };
}

/** App-wide settings that aren't about sign-in (those are under Security). */
export function AdminSettingsView() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<AdminSettings>('/admin/settings'),
  });
  const update = useMutation({
    mutationFn: (selfMonitoring: boolean) => api.post('/admin/settings', { selfMonitoring }),
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.success(enabled ? 'Self monitoring is on' : 'Self monitoring is off');
    },
    onError: error => toast.error(error.message),
  });
  const self = data?.selfMonitoring;

  return (
    <div className="space-y-6">
      <PageHeader icon={Settings} title="Settings" description="Settings for the whole instance. Sign-in rules are under Security." />
      <Card>
        <CardHeader>
          <CardTitle>Self monitoring</CardTitle>
          <CardDescription>
            Ghostwire Analytics monitors itself like the other Ghostwire apps: its requests, database queries and
            outside calls, in a site of its own.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!self ? (
            <Skeleton className="h-12 w-full max-w-2xl" />
          ) : (
            <Field orientation="horizontal" className="max-w-2xl">
              <FieldContent>
                <FieldTitle>Self monitoring</FieldTitle>
                <FieldDescription>
                  {!self.available ? (
                    'Unavailable: OTEL_SDK_DISABLED is set for this server.'
                  ) : self.website ? (
                    <>
                      Data goes to{' '}
                      <Link
                        href={`/websites/${self.website.id}/system`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {self.website.name}
                      </Link>
                      . Turning it off keeps the site and its data.
                    </>
                  ) : (
                    'The first time it is turned on, a site named after this instance is created for it. No URL or key is needed.'
                  )}
                </FieldDescription>
              </FieldContent>
              <Switch
                checked={self.enabled}
                onCheckedChange={value => update.mutate(value)}
                disabled={update.isPending || !self.available}
                aria-label="Self monitoring"
              />
            </Field>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
