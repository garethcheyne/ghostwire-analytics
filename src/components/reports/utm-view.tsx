'use client';
import { BarList } from '@/components/analytics/bar-list';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useAnalyticsQuery } from '@/hooks/queries/analytics';

const PARAMETERS = [
  { type: 'utm_source', label: 'Source', hint: 'utm_source: where the visit came from' },
  { type: 'utm_medium', label: 'Medium', hint: 'utm_medium: e.g. email, cpc, social' },
  { type: 'utm_campaign', label: 'Campaign', hint: 'utm_campaign' },
  { type: 'utm_content', label: 'Content', hint: 'utm_content: which link or ad' },
  { type: 'utm_term', label: 'Term', hint: 'utm_term: paid search keyword' },
] as const;

function UtmCard({ websiteId, type, label, hint }: (typeof PARAMETERS)[number] & { websiteId: string }) {
  const { data, isPending } = useAnalyticsQuery<{ utm: string; views: number }[]>(websiteId, 'utm/metrics', {
    type,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription className="font-mono text-xs">{hint}</CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <BarList
            rows={(data ?? []).map(row => ({ key: row.utm, label: row.utm, value: Number(row.views) }))}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** Views by each UTM campaign parameter. */
export function UtmView() {
  const { id } = useCurrentWebsite();

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="UTM" />
      <p className="text-sm text-muted-foreground">
        Page views from links tagged with UTM parameters, e.g.{' '}
        <code className="font-mono text-xs">?utm_source=newsletter&amp;utm_campaign=launch</code>.
      </p>
      <div className="grid gap-6 lg:grid-cols-2">
        {PARAMETERS.map(parameter => (
          <UtmCard key={parameter.type} websiteId={id} {...parameter} />
        ))}
      </div>
    </div>
  );
}
