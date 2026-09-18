'use client';
import { ExternalLink } from 'lucide-react';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useActiveVisitors } from '@/hooks/queries/analytics';
import { DateRangePicker } from './date-range-picker';
import { FilterControls } from './filter-controls';
import { FilterBar } from './filter-bar';
import { AppLink } from '@/components/share/share-context';

function LiveVisitors({ websiteId }: { websiteId: string }) {
  const { data } = useActiveVisitors(websiteId);
  const { kind = 'website' } = useCurrentWebsite();
  const visitors = data?.visitors ?? 0;

  return (
    <AppLink
      // Realtime is a website page; for links and pixels the badge is just a count.
      href={kind === 'website' ? `/websites/${websiteId}/realtime` : '#'}
      onClick={kind === 'website' ? undefined : event => event.preventDefault()}
      className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-muted/50"
    >
      <span className="relative flex size-2">
        {visitors > 0 && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-status-online opacity-75" />
        )}
        <span
          className={`relative inline-flex size-2 rounded-full ${visitors > 0 ? 'bg-status-online' : 'bg-status-pending'}`}
        />
      </span>
      <span className="tabular-nums">
        {visitors} {visitors === 1 ? 'visitor' : 'visitors'} now
      </span>
    </AppLink>
  );
}

/** Title row for a website's analytics pages: name, live visitors, date range, filters. */
export function WebsiteHeader({ title }: { title?: string }) {
  const website = useCurrentWebsite();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {title ?? website.name}
            </h1>
            <LiveVisitors websiteId={website.id} />
          </div>
          {website.domain && (
            <a
              href={`https://${website.domain}`}
              target="_blank"
              rel="noreferrer"
              className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {title ? `${website.name} · ${website.domain}` : website.domain}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterControls websiteId={website.id} />
          <DateRangePicker websiteId={website.id} />
        </div>
      </div>
      <FilterBar websiteId={website.id} />
    </div>
  );
}
