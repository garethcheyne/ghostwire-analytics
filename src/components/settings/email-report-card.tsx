'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { Send } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
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
import { api, type PageResult } from '@/lib/api-client';

interface EmailReportSettings {
  frequency: 'off' | 'weekly' | 'monthly';
  websiteIds: string[];
  lastSentAt: string | null;
  email: string | null;
  emailConfigured: boolean;
}

function EmailReportForm({ initial }: { initial: EmailReportSettings }) {
  const queryClient = useQueryClient();
  const [frequency, setFrequency] = useState(initial.frequency);
  const [websiteIds, setWebsiteIds] = useState(initial.websiteIds);
  const { data: websites } = useQuery({
    queryKey: ['me', 'websites', 'all'],
    queryFn: () =>
      api.get<PageResult<{ id: string; name: string }>>('/me/websites', {
        includeTeams: 'true',
        pageSize: 100,
      }),
  });
  const save = useMutation({
    mutationFn: () => api.post('/me/email-report', { frequency, websiteIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me', 'email-report'] });
      toast.success(frequency === 'off' ? 'Email reports turned off' : 'Email report saved');
    },
    onError: error => toast.error(error.message),
  });
  const send = useMutation({
    mutationFn: () =>
      api.post('/me/email-report/send', {
        frequency: frequency === 'off' ? 'weekly' : frequency,
        websiteIds,
      }),
    onSuccess: () => toast.success(`Report sent to ${initial.email}`),
    onError: error => toast.error(error.message),
  });
  const disabled = !initial.emailConfigured || !initial.email;

  const toggle = (id: string, on: boolean) =>
    setWebsiteIds(current => (on ? [...current, id] : current.filter(item => item !== id)));

  return (
    <>
      <CardContent>
        <FieldGroup className="max-w-xl">
          <Field>
            <FieldLabel>Send me</FieldLabel>
            <Select
              value={frequency}
              onValueChange={value => setFrequency(value as EmailReportSettings['frequency'])}
              disabled={disabled}
            >
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="off">No reports</SelectItem>
                  <SelectItem value="weekly">A weekly report (Mondays)</SelectItem>
                  <SelectItem value="monthly">A monthly report (on the 1st)</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {initial.email ? (
                <>
                  To {initial.email}
                  {initial.lastSentAt &&
                    ` · last sent ${formatDistanceToNowStrict(new Date(initial.lastSentAt), { addSuffix: true })}`}
                </>
              ) : (
                <>
                  Add an email address in{' '}
                  <Link href="/settings/profile" className="underline underline-offset-4">
                    your profile
                  </Link>{' '}
                  first.
                </>
              )}
            </FieldDescription>
          </Field>
          {frequency !== 'off' && !!websites?.data.length && (
            <FieldSet>
              <FieldLegend variant="label">Websites</FieldLegend>
              <FieldDescription>None ticked means all of them (up to 20).</FieldDescription>
              <div className="grid gap-2 sm:grid-cols-2">
                {websites.data.map(website => (
                  <Field key={website.id} orientation="horizontal">
                    <Checkbox
                      id={`report-${website.id}`}
                      checked={websiteIds.includes(website.id)}
                      onCheckedChange={checked => toggle(website.id, checked === true)}
                    />
                    <FieldLabel htmlFor={`report-${website.id}`} className="font-normal">
                      {website.name}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </FieldSet>
          )}
        </FieldGroup>
      </CardContent>
      {!disabled && (
        <CardFooter className="gap-2">
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
          <Button variant="outline" onClick={() => send.mutate()} disabled={send.isPending}>
            {send.isPending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            Send one now
          </Button>
        </CardFooter>
      )}
    </>
  );
}

/** Weekly or monthly summary emails of your websites. */
export function EmailReportCard() {
  const { data } = useQuery({
    queryKey: ['me', 'email-report'],
    queryFn: () => api.get<EmailReportSettings>('/me/email-report'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email reports</CardTitle>
        <CardDescription>
          Visitors, views and errors for your websites against the period before, with top pages and
          sources.
          {data && !data.emailConfigured && ' Needs SMTP on the server (SMTP_URL and SMTP_FROM).'}
        </CardDescription>
      </CardHeader>
      {data ? (
        <EmailReportForm key={JSON.stringify(data)} initial={data} />
      ) : (
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      )}
    </Card>
  );
}
