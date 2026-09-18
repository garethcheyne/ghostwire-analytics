'use client';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useWebsiteMetrics } from '@/hooks/queries/analytics';

export type TargetType = 'path' | 'event';

/**
 * A page path or event name, with suggestions from the website's top values
 * (native datalist, so any value can still be typed).
 */
export function TargetInput({
  websiteId,
  type,
  value,
  onTypeChange,
  onValueChange,
  id,
}: {
  websiteId: string;
  type: TargetType;
  value: string;
  onTypeChange: (type: TargetType) => void;
  onValueChange: (value: string) => void;
  id?: string;
}) {
  const listId = useId();
  const { data } = useWebsiteMetrics(websiteId, type, 100);

  return (
    <div className="flex gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        value={type}
        onValueChange={next => next && onTypeChange(next as TargetType)}
      >
        <ToggleGroupItem value="path">Page</ToggleGroupItem>
        <ToggleGroupItem value="event">Event</ToggleGroupItem>
      </ToggleGroup>
      <Input
        id={id}
        list={listId}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        placeholder={type === 'path' ? '/pricing' : 'signup'}
        className="flex-1 font-mono"
        required
      />
      <datalist id={listId}>
        {(data ?? [])
          .filter(row => row.x)
          .map(row => (
            <option key={row.x} value={row.x ?? ''} />
          ))}
      </datalist>
    </div>
  );
}
