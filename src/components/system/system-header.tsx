'use client';
import { Activity, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DateRangePicker, SYSTEM_PRESETS } from '@/components/analytics/date-range-picker';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { type SystemService, useServiceFilter, useSystemServices } from '@/hooks/queries/system';
import { cn } from '@/lib/utils';

export function serviceLabel(service: Pick<SystemService, 'namespace' | 'name'>) {
  return service.namespace ? `${service.namespace} / ${service.name}` : service.name;
}

/** Picks one service for the page (?service=<id>), or all of them. */
function ServicePicker({ websiteId }: { websiteId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selected = useServiceFilter();
  const { data: services } = useSystemServices(websiteId);

  if (!services?.length) return null;

  const groups = [...new Set(services.map(s => s.namespace))];

  const select = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value === 'all') params.delete('service');
    else params.set('service', value);
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <Select value={selected ?? 'all'} onValueChange={select}>
      <SelectTrigger className="w-full sm:w-56" aria-label="Service">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectItem value="all">All services</SelectItem>
        </SelectGroup>
        {groups.map(namespace => (
          <SelectGroup key={namespace}>
            <SelectLabel>{namespace || 'No namespace'}</SelectLabel>
            {services
              .filter(s => s.namespace === namespace)
              .map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Header of every System page: title, the service filter and the date range. */
export function SystemHeader({
  icon,
  title,
  description,
  serviceFilter = true,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  serviceFilter?: boolean;
}) {
  const website = useCurrentWebsite();

  return (
    <PageHeader
      icon={icon}
      title={title}
      description={description}
      className="sm:flex-col sm:items-stretch lg:flex-row lg:items-center"
    >
      {serviceFilter && <ServicePicker websiteId={website.id} />}
      <DateRangePicker websiteId={website.id} presets={SYSTEM_PRESETS} />
    </PageHeader>
  );
}

const STATUS_STYLE = {
  up: 'bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30',
  down: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30',
  idle: 'text-muted-foreground',
} as const;

const STATUS_LABEL = { up: 'Up', down: 'Down', idle: 'Idle' } as const;

export function StatusBadge({ status, reason }: { status: SystemService['status']; reason?: string }) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-normal', STATUS_STYLE[status])} title={reason}>
      <span
        className={cn(
          'size-1.5 rounded-full',
          status === 'up' ? 'bg-green-500' : status === 'down' ? 'bg-red-500' : 'bg-muted-foreground',
        )}
      />
      {STATUS_LABEL[status]}
    </Badge>
  );
}

/** Shown before any app has sent monitoring data to this website. */
export function NoMonitoringData({ websiteId, what = 'monitoring data' }: { websiteId: string; what?: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Activity />
        </EmptyMedia>
        <EmptyTitle>No {what} yet</EmptyTitle>
        <EmptyDescription>
          Turn on &quot;Send monitoring to Ghostwire Analytics&quot; in a Ghostwire app&apos;s Settings, with this
          site&apos;s ID and ingest key. Any OpenTelemetry SDK or Collector can also send OTLP/HTTP to{' '}
          <code className="font-mono">/v1/metrics</code> and <code className="font-mono">/v1/traces</code>.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          href={`/websites/${websiteId}/settings?tab=errors`}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Get the ingest key
        </Link>
      </EmptyContent>
    </Empty>
  );
}
