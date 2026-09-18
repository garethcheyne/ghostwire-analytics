'use client';
import { useMemo, useState } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useEventProperties, useEventPropertyValues } from '@/hooks/queries/analytics';
import { formatLongNumber } from '@/lib/format';

/** Pick an event and one of its properties to see the value breakdown. */
export function EventProperties({ websiteId }: { websiteId: string }) {
  const { data: properties, isPending } = useEventProperties(websiteId);
  const [eventName, setEventName] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const { data: values, isPending: valuesPending } = useEventPropertyValues(
    websiteId,
    eventName,
    propertyName,
  );

  const eventNames = useMemo(
    () => [...new Set((properties ?? []).map(p => p.eventName))].sort(),
    [properties],
  );
  const propertyNames = useMemo(
    () =>
      [
        ...new Set(
          (properties ?? []).filter(p => p.eventName === eventName).map(p => p.propertyName),
        ),
      ].sort(),
    [properties, eventName],
  );

  if (isPending) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (!eventNames.length) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No event properties yet. Send data with an event, e.g.{' '}
        <code className="font-mono text-xs">ghostwire.track(&apos;signup&apos;, &#123; plan: &apos;pro&apos; &#125;)</code>{' '}
        or <code className="font-mono text-xs">data-ghostwire-event-plan=&quot;pro&quot;</code>.
      </p>
    );
  }

  const total = (values ?? []).reduce((sum, row) => sum + Number(row.total), 0) || 1;
  const max = Math.max(1, ...(values ?? []).map(row => Number(row.total)));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <Field className="w-56">
          <FieldLabel>Event</FieldLabel>
          <Select
            value={eventName}
            onValueChange={value => {
              setEventName(value);
              setPropertyName('');
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose an event" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {eventNames.map(name => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-56">
          <FieldLabel>Property</FieldLabel>
          <Select value={propertyName} onValueChange={setPropertyName} disabled={!eventName}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a property" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {propertyNames.map(name => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {eventName && propertyName && (
        valuesPending ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="flex max-w-2xl flex-col gap-1">
            {(values ?? []).map(row => (
              <li key={row.value} className="relative">
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
                  style={{ width: `${(Number(row.total) / max) * 100}%` }}
                  aria-hidden
                />
                <div className="relative flex items-center gap-3 px-2 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{row.value}</span>
                  <span className="font-medium tabular-nums">{formatLongNumber(Number(row.total))}</span>
                  <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                    {Math.round((Number(row.total) / total) * 100)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
