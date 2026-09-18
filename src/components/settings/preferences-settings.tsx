'use client';
import { useTheme } from 'next-themes';
import { useMemo, useSyncExternalStore } from 'react';
import { PRESETS } from '@/components/analytics/date-range-picker';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { setDefaultDateRange, useDefaultDateRange } from '@/hooks/use-default-date-range';
import { setTimezone, useTimezone } from '@/hooks/use-timezone';

const BROWSER_TIMEZONE = '__browser__';
const subscribe = () => () => {};

export function PreferencesSettings() {
  const timezone = useTimezone();
  const dateRange = useDefaultDateRange();
  const { theme, setTheme } = useTheme();
  // Browser-only values, read after hydration.
  const browserTimezone = useSyncExternalStore(
    subscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => '',
  );
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf('timeZone');
    } catch {
      return [timezone];
    }
  }, [timezone]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Preferences" description="Saved in this browser." />
      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
          <CardDescription>How dates and reports are shown to you.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="max-w-xl">
            <Field>
              <FieldLabel>Timezone</FieldLabel>
              <Select
                value={timezone === browserTimezone ? BROWSER_TIMEZONE : timezone}
                onValueChange={value => setTimezone(value === BROWSER_TIMEZONE ? null : value)}
              >
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectGroup>
                    <SelectItem value={BROWSER_TIMEZONE}>
                      This device{browserTimezone && ` (${browserTimezone.replace(/_/g, ' ')})`}
                    </SelectItem>
                    {zones.map(zone => (
                      <SelectItem key={zone} value={zone}>
                        {zone.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>Reports group days and hours in this timezone.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Default date range</FieldLabel>
              <Select value={dateRange} onValueChange={setDefaultDateRange}>
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {PRESETS.map(preset => (
                      <SelectItem key={preset.value} value={preset.value}>
                        {preset.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>What reports show when you first open them.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>Theme</FieldLabel>
              <ToggleGroup
                type="single"
                variant="outline"
                value={theme ?? 'dark'}
                onValueChange={value => value && setTheme(value)}
                className="w-fit"
              >
                <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
                <ToggleGroupItem value="light">Light</ToggleGroupItem>
                <ToggleGroupItem value="system">System</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
