'use client';
import { ChevronRight, Eye, Zap } from 'lucide-react';
import { useState } from 'react';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useAnalyticsQuery } from '@/hooks/queries/analytics';
import { formatLongNumber } from '@/lib/format';

interface Journey {
  items: (string | null)[];
  count: number;
}

function Step({ value }: { value: string }) {
  const isPage = value.startsWith('/');
  const Icon = isPage ? Eye : Zap;

  return (
    <span className="inline-flex max-w-56 items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
      <Icon className={isPage ? 'size-3.5 shrink-0 text-muted-foreground' : 'size-3.5 shrink-0 text-chart-4'} />
      <span className="truncate font-mono">{value}</span>
    </span>
  );
}

/** The most common paths visitors take, as sequences of pages and events. */
export function JourneysView() {
  const { id } = useCurrentWebsite();
  const [steps, setSteps] = useState('4');
  const [startStep, setStartStep] = useState('');
  const [endStep, setEndStep] = useState('');
  const { data, isPending } = useAnalyticsQuery<Journey[]>(id, 'journeys', {
    steps,
    startStep: startStep.trim() || undefined,
    endStep: endStep.trim() || undefined,
  });

  const journeys = (data ?? []).slice(0, 50);
  const top = Math.max(1, ...journeys.map(j => j.count));

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Journeys" />
      <Card>
        <CardHeader>
          <CardTitle>Journeys</CardTitle>
          <CardDescription>Most common sequences of pages and events within a visit.</CardDescription>
          <div className="flex flex-wrap gap-4 pt-2">
            <Field className="w-32">
              <FieldLabel>Steps</FieldLabel>
              <Select value={steps} onValueChange={setSteps}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {[2, 3, 4, 5, 6, 7].map(n => (
                      <SelectItem key={n} value={String(n)}>
                        {n} steps
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field className="w-56">
              <FieldLabel htmlFor="journey-start">Starts with</FieldLabel>
              <Input
                id="journey-start"
                placeholder="Any page or event"
                value={startStep}
                onChange={event => setStartStep(event.target.value)}
                className="font-mono"
              />
            </Field>
            <Field className="w-56">
              <FieldLabel htmlFor="journey-end">Ends with</FieldLabel>
              <Input
                id="journey-end"
                placeholder="Any page or event"
                value={endStep}
                onChange={event => setEndStep(event.target.value)}
                className="font-mono"
              />
            </Field>
          </div>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : journeys.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No journeys match.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {journeys.map((journey, index) => {
                const path = journey.items.filter((item): item is string => !!item);

                return (
                  <li key={`${path.join('>')}-${index}`} className="relative overflow-hidden rounded-md">
                    <div
                      className="absolute inset-y-0 left-0 bg-primary/10"
                      style={{ width: `${(journey.count / top) * 100}%` }}
                      aria-hidden
                    />
                    <div className="relative flex items-center gap-3 px-2 py-2">
                      <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                        {index + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                        {path.map((step, stepIndex) => (
                          <span key={stepIndex} className="flex items-center gap-1">
                            {stepIndex > 0 && <ChevronRight className="size-3.5 text-muted-foreground" />}
                            <Step value={step} />
                          </span>
                        ))}
                        {path.length < journey.items.length && (
                          <span className="ml-1 text-xs text-muted-foreground">then left</span>
                        )}
                      </div>
                      <span className="text-sm font-medium tabular-nums">{formatLongNumber(journey.count)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
