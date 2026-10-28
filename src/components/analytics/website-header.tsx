'use client';
import { ExternalLink, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useActiveVisitors } from '@/hooks/queries/analytics';
import { DateRangePicker } from './date-range-picker';
import { FilterControls } from './filter-controls';
import { FilterBar } from './filter-bar';
import { AppLink, useShare } from '@/components/share/share-context';
import { ExportButton } from './export-button';
import { ReportButton } from './report-button';

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
export function WebsiteHeader({ icon, title }: { icon: LucideIcon; title?: string }) {
  const website = useCurrentWebsite();
  const share = useShare();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        icon={icon}
        title={title ?? website.name}
        description={
          website.domain && (
            <a
              href={`https://${website.domain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-fit items-center gap-1 hover:text-foreground"
            >
              {title ? `${website.name} · ${website.domain}` : website.domain}
              <ExternalLink className="size-3" />
            </a>
          )
        }
        // Several controls: stay stacked until there is room for them beside the title.
        className="sm:flex-col sm:items-stretch lg:flex-row lg:items-center"
      >
        <LiveVisitors websiteId={website.id} />
        <FilterControls websiteId={website.id} />
        <DateRangePicker websiteId={website.id} />
        {!share && <ExportButton websiteId={website.id} name={website.name} />}
        {!share && <ReportButton websiteId={website.id} name={website.name} />}
      </PageHeader>
      <FilterBar websiteId={website.id} />
    </div>
  );
}
