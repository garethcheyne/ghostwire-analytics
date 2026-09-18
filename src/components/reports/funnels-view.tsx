'use client';
import { ArrowDown, Filter, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { WebsiteHeader } from '@/components/analytics/website-header';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useAnalyticsQuery } from '@/hooks/queries/analytics';
import {
  type Definition,
  type FunnelParameters,
  type FunnelStep,
  useDefinitions,
  useSaveDefinition,
} from '@/hooks/queries/definitions';
import { formatLongNumber } from '@/lib/format';
import { DefinitionActions } from './definition-actions';
import { TargetInput } from './target-input';

type Funnel = Definition<FunnelParameters>;

interface StepResult extends FunnelStep {
  visitors: number;
  previous: number;
  dropped: number;
  dropoff: number | null;
  remaining: number;
}

const MIN_STEPS = 2;
const MAX_STEPS = 8;

function FunnelDialog({
  websiteId,
  funnel,
  onOpenChange,
}: {
  websiteId: string;
  funnel?: Funnel;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveDefinition<FunnelParameters>(websiteId, 'funnels');
  const [name, setName] = useState(funnel?.name ?? '');
  const [window, setWindow] = useState(funnel?.parameters.window ?? 60);
  const [steps, setSteps] = useState<FunnelStep[]>(
    funnel?.parameters.steps ?? [
      { type: 'path', value: '' },
      { type: 'path', value: '' },
    ],
  );

  const updateStep = (index: number, change: Partial<FunnelStep>) =>
    setSteps(current => current.map((step, i) => (i === index ? { ...step, ...change } : step)));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      await save.mutateAsync({
        id: funnel?.id,
        name: name.trim(),
        parameters: { window, steps: steps.map(step => ({ ...step, value: step.value.trim() })) },
      });
      toast.success(funnel ? 'Funnel updated' : 'Funnel added');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the funnel.');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{funnel ? 'Edit funnel' : 'Add funnel'}</DialogTitle>
            <DialogDescription>
              Visitors count toward a step only if they completed the steps before it, in order.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="funnel-name">Name</FieldLabel>
              <Input
                id="funnel-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Signup"
                maxLength={200}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="funnel-window">Time limit (minutes)</FieldLabel>
              <Input
                id="funnel-window"
                type="number"
                min={1}
                value={window}
                onChange={event => setWindow(Math.max(1, Number(event.target.value) || 1))}
                className="w-32"
              />
              <FieldDescription>How long a visitor has to go from the first step to the last.</FieldDescription>
            </Field>
            <FieldSet>
              <FieldLegend variant="label">Steps</FieldLegend>
              <ol className="flex flex-col gap-3">
                {steps.map((step, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <TargetInput
                        websiteId={websiteId}
                        type={step.type}
                        value={step.value}
                        onTypeChange={type => updateStep(index, { type })}
                        onValueChange={value => updateStep(index, { value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove step ${index + 1}`}
                      disabled={steps.length <= MIN_STEPS}
                      onClick={() => setSteps(current => current.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ol>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={steps.length >= MAX_STEPS}
                onClick={() => setSteps(current => [...current, { type: 'path', value: '' }])}
              >
                <Plus data-icon="inline-start" />
                Add step
              </Button>
            </FieldSet>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner data-icon="inline-start" />}
              {funnel ? 'Save' : 'Add funnel'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FunnelCard({ websiteId, funnel, onEdit }: { websiteId: string; funnel: Funnel; onEdit: () => void }) {
  const { data, isPending } = useAnalyticsQuery<StepResult[]>(websiteId, `funnels/${funnel.id}/stats`);
  const first = Number(data?.[0]?.visitors ?? 0);
  const last = Number(data?.[data.length - 1]?.visitors ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{funnel.name}</CardTitle>
        <CardDescription>
          {funnel.parameters.steps.length} steps within {funnel.parameters.window} minutes
          {data && first > 0 && ` · ${((last / first) * 100).toFixed(1)}% converted`}
        </CardDescription>
        <CardAction>
          <DefinitionActions websiteId={websiteId} kind="funnels" id={funnel.id} name={funnel.name} onEdit={onEdit} />
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending || !data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ol className="flex flex-col">
            {data.map((step, index) => {
              const share = first ? (Number(step.visitors) / first) * 100 : 0;
              const fromPrevious =
                index > 0 && Number(step.previous) ? (Number(step.visitors) / Number(step.previous)) * 100 : null;

              return (
                <li key={index} className="flex flex-col gap-1">
                  {index > 0 && (
                    <div className="flex items-center gap-2 py-1 pl-8 text-xs text-muted-foreground">
                      <ArrowDown className="size-3.5" />
                      {fromPrevious === null
                        ? 'No visitors reached the previous step'
                        : `${fromPrevious.toFixed(1)}% continued · ${formatLongNumber(Number(step.dropped))} dropped off`}
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                      {index + 1}
                    </span>
                    <div className="relative min-w-0 flex-1 overflow-hidden rounded-md bg-muted/50">
                      <div
                        className="absolute inset-y-0 left-0 bg-linear-to-r from-cyan-500/40 to-purple-500/40"
                        style={{ width: `${share}%` }}
                        aria-hidden
                      />
                      <div className="relative flex items-center gap-3 px-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          <span className="text-muted-foreground">{step.type === 'path' ? 'Viewed ' : 'Triggered '}</span>
                          <span className="font-mono">{step.value}</span>
                        </span>
                        <span className="font-medium tabular-nums">{formatLongNumber(Number(step.visitors))}</span>
                        <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                          {share.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function FunnelsView() {
  const { id, canUpdate } = useCurrentWebsite();
  const { data, isPending } = useDefinitions<FunnelParameters>(id, 'funnels');
  const [editing, setEditing] = useState<Funnel | 'new' | null>(null);
  const funnels = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Funnels" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Where visitors drop out of a sequence of steps.</p>
        {canUpdate && (
          <Button onClick={() => setEditing('new')}>
            <Plus data-icon="inline-start" />
            Add funnel
          </Button>
        )}
      </div>

      {isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : funnels.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Filter />
            </EmptyMedia>
            <EmptyTitle>No funnels yet</EmptyTitle>
            <EmptyDescription>
              For example: home page → pricing → sign up → signup completed.
            </EmptyDescription>
          </EmptyHeader>
          {canUpdate && (
            <EmptyContent>
              <Button onClick={() => setEditing('new')}>Add funnel</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {funnels.map(funnel => (
            <FunnelCard key={funnel.id} websiteId={id} funnel={funnel} onEdit={() => setEditing(funnel)} />
          ))}
        </div>
      )}

      {editing && (
        <FunnelDialog
          websiteId={id}
          funnel={editing === 'new' ? undefined : editing}
          onOpenChange={open => !open && setEditing(null)}
        />
      )}
    </div>
  );
}
