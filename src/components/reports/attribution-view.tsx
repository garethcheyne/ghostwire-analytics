'use client';
import { useState } from 'react';
import { BarList } from '@/components/analytics/bar-list';
import { StatCards } from '@/components/analytics/stat-cards';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useAnalyticsQuery } from '@/hooks/queries/analytics';
import { formatLongNumber } from '@/lib/format';
import { TargetInput, type TargetType } from './target-input';

type Rows = { name: string; value: number }[];

interface AttributionResult {
  referrer: Rows;
  paidAds: Rows;
  utm_source: Rows;
  utm_medium: Rows;
  utm_campaign: Rows;
  utm_content: Rows;
  utm_term: Rows;
  total: { pageviews: number; visitors: number; visits: number };
}

const SECTIONS: { key: keyof Omit<AttributionResult, 'total'>; title: string }[] = [
  { key: 'referrer', title: 'Referrers' },
  { key: 'paidAds', title: 'Paid ads' },
  { key: 'utm_source', title: 'UTM source' },
  { key: 'utm_medium', title: 'UTM medium' },
  { key: 'utm_campaign', title: 'UTM campaign' },
  { key: 'utm_content', title: 'UTM content' },
];

/** Which sources get credit for visitors who reached a conversion page or event. */
export function AttributionView() {
  const { id } = useCurrentWebsite();
  const [model, setModel] = useState<'first-click' | 'last-click'>('first-click');
  const [type, setType] = useState<TargetType>('event');
  const [step, setStep] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data, isPending } = useAnalyticsQuery<AttributionResult>(
    id,
    'attribution',
    { model, type, step: submitted },
    { enabled: !!submitted },
  );

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Attribution" />
      <Card>
        <CardHeader>
          <CardTitle>Conversion</CardTitle>
          <CardDescription>
            Credit the source of each visitor who reached this page or event, using their first or
            last visit.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-wrap items-end gap-4"
            onSubmit={event => {
              event.preventDefault();
              setSubmitted(step.trim());
            }}
          >
            <Field className="min-w-80 flex-1">
              <FieldLabel htmlFor="attribution-step">Conversion</FieldLabel>
              <TargetInput
                id="attribution-step"
                websiteId={id}
                type={type}
                value={step}
                onTypeChange={setType}
                onValueChange={setStep}
              />
            </Field>
            <Field className="w-auto">
              <FieldLabel>Model</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={model}
                onValueChange={value => value && setModel(value as typeof model)}
              >
                <ToggleGroupItem value="first-click">First click</ToggleGroupItem>
                <ToggleGroupItem value="last-click">Last click</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <button type="submit" className="hidden" />
          </form>
          {!submitted && (
            <p className="pt-4 text-sm text-muted-foreground">Choose a page or event and press Enter.</p>
          )}
        </CardContent>
      </Card>

      {submitted && (
        <>
          <StatCards
            loading={isPending}
            stats={
              data && [
                { label: 'Converting visitors', value: Number(data.total.visitors), format: formatLongNumber },
                { label: 'Visits', value: Number(data.total.visits), format: formatLongNumber },
                { label: 'Views', value: Number(data.total.pageviews), format: formatLongNumber },
              ]
            }
          />
          <div className="grid gap-6 lg:grid-cols-2">
            {SECTIONS.map(section => (
              <Card key={section.key}>
                <CardHeader>
                  <CardTitle>{section.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {isPending || !data ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <BarList
                      rows={data[section.key].map(row => ({
                        key: row.name,
                        label: row.name,
                        value: Number(row.value),
                      }))}
                    />
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
