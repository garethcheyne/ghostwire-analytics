'use client';
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldTitle,
} from '@/components/ui/field';
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
import { Slider } from '@/components/ui/slider';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { type ReplayConfig, useUpdateWebsite, useWebsite } from '@/hooks/queries/websites';
import { useCurrentWebsite } from '../website-context';

// Defaults match the recorder (src/lib/recorder.ts).
const DEFAULTS: Required<ReplayConfig> = {
  replayEnabled: false,
  heatmapEnabled: false,
  sampleRate: 0.15,
  heatmapSampleRate: 0.15,
  maskLevel: 'moderate',
  maxDuration: 300000,
  blockSelector: '',
};

function RateSlider({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4">
      <Slider
        id={id}
        min={1}
        max={100}
        step={1}
        value={[Math.round(value * 100)]}
        onValueChange={([next]) => onChange(next / 100)}
        disabled={disabled}
        className="max-w-xs"
      />
      <span className="w-12 text-right text-sm tabular-nums">{Math.round(value * 100)}%</span>
    </div>
  );
}

function RecordingForm({ initial }: { initial: Required<ReplayConfig> }) {
  const website = useCurrentWebsite();
  const updateWebsite = useUpdateWebsite(website.id);
  const [config, setConfig] = useState(initial);
  const disabled = !website.canUpdate;

  const set = <K extends keyof ReplayConfig>(key: K, value: Required<ReplayConfig>[K]) =>
    setConfig(current => ({ ...current, [key]: value }));

  async function save() {
    try {
      await updateWebsite.mutateAsync({ replayConfig: config });
      toast.success('Recording settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save recording settings.');
    }
  }

  return (
    <>
      <CardContent>
        <FieldGroup className="max-w-2xl">
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Session replay</FieldTitle>
              <FieldDescription>
                Record DOM changes so visits can be replayed. Adds a second script to the page.
              </FieldDescription>
            </FieldContent>
            <Switch
              checked={config.replayEnabled}
              onCheckedChange={value => set('replayEnabled', value)}
              disabled={disabled}
              aria-label="Session replay"
            />
          </Field>
          {config.replayEnabled && (
            <>
              <Field>
                <FieldLabel htmlFor="replay-sample">Sessions to record</FieldLabel>
                <RateSlider
                  id="replay-sample"
                  value={config.sampleRate}
                  onChange={value => set('sampleRate', value)}
                  disabled={disabled}
                />
              </Field>
              <Field>
                <FieldLabel>Text masking</FieldLabel>
                <Select
                  value={config.maskLevel}
                  onValueChange={value => set('maskLevel', value as ReplayConfig['maskLevel'] & string)}
                  disabled={disabled}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="moderate">Moderate: mask inputs</SelectItem>
                      <SelectItem value="strict">Strict: mask all text</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="replay-duration">Maximum length (minutes)</FieldLabel>
                <Input
                  id="replay-duration"
                  type="number"
                  min={1}
                  max={120}
                  value={Math.round(config.maxDuration / 60000)}
                  onChange={event =>
                    set('maxDuration', Math.max(1, Number(event.target.value) || 1) * 60000)
                  }
                  disabled={disabled}
                  className="w-32"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="replay-block">Never record</FieldLabel>
                <Input
                  id="replay-block"
                  placeholder=".private, [data-no-record]"
                  value={config.blockSelector}
                  onChange={event => set('blockSelector', event.target.value)}
                  disabled={disabled}
                  className="font-mono"
                />
                <FieldDescription>CSS selector for elements to leave out of recordings.</FieldDescription>
              </Field>
            </>
          )}
          <FieldSeparator />
          <Field orientation="horizontal">
            <FieldContent>
              <FieldTitle>Heatmaps</FieldTitle>
              <FieldDescription>Collect click positions and scroll depth per page.</FieldDescription>
            </FieldContent>
            <Switch
              checked={config.heatmapEnabled}
              onCheckedChange={value => set('heatmapEnabled', value)}
              disabled={disabled}
              aria-label="Heatmaps"
            />
          </Field>
          {config.heatmapEnabled && (
            <Field>
              <FieldLabel htmlFor="heatmap-sample">Sessions to sample</FieldLabel>
              <RateSlider
                id="heatmap-sample"
                value={config.heatmapSampleRate}
                onChange={value => set('heatmapSampleRate', value)}
                disabled={disabled}
              />
            </Field>
          )}
        </FieldGroup>
      </CardContent>
      {!disabled && (
        <CardFooter>
          <Button onClick={save} disabled={updateWebsite.isPending}>
            {updateWebsite.isPending && <Spinner data-icon="inline-start" />}
            Save
          </Button>
        </CardFooter>
      )}
    </>
  );
}

export function RecordingSettings() {
  const website = useCurrentWebsite();
  const { data, isPending } = useWebsite(website.id);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Replays & heatmaps</CardTitle>
        <CardDescription>
          Off by default. When either is on, the tracker loads the recorder for sampled visits.
        </CardDescription>
      </CardHeader>
      {isPending || !data ? (
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full max-w-2xl" />
          <Skeleton className="h-10 w-full max-w-2xl" />
        </CardContent>
      ) : (
        <RecordingForm initial={{ ...DEFAULTS, ...(data.replayConfig ?? {}) }} />
      )}
    </Card>
  );
}
