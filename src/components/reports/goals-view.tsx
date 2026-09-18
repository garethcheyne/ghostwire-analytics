'use client';
import { Plus, Target } from 'lucide-react';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useCurrentWebsite } from '@/components/websites/website-context';
import { useAnalyticsQuery } from '@/hooks/queries/analytics';
import {
  type Definition,
  type GoalParameters,
  useDefinitions,
  useSaveDefinition,
} from '@/hooks/queries/definitions';
import { formatLongNumber } from '@/lib/format';
import { DefinitionActions } from './definition-actions';
import { TargetInput, type TargetType } from './target-input';

type Goal = Definition<GoalParameters>;

function GoalDialog({
  websiteId,
  goal,
  onOpenChange,
}: {
  websiteId: string;
  goal?: Goal;
  onOpenChange: (open: boolean) => void;
}) {
  const save = useSaveDefinition<GoalParameters>(websiteId, 'goals');
  const [name, setName] = useState(goal?.name ?? '');
  const [type, setType] = useState<TargetType>(goal?.parameters.type ?? 'path');
  const [value, setValue] = useState(goal?.parameters.value ?? '');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    try {
      await save.mutateAsync({ id: goal?.id, name: name.trim(), parameters: { type, value: value.trim() } });
      toast.success(goal ? 'Goal updated' : 'Goal added');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the goal.');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{goal ? 'Edit goal' : 'Add goal'}</DialogTitle>
            <DialogDescription>
              A goal counts the visitors who view a page or trigger an event.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="goal-name">Name</FieldLabel>
              <Input
                id="goal-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Signed up"
                maxLength={200}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="goal-target">Completed when a visitor…</FieldLabel>
              <TargetInput
                id="goal-target"
                websiteId={websiteId}
                type={type}
                value={value}
                onTypeChange={setType}
                onValueChange={setValue}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Spinner data-icon="inline-start" />}
              {goal ? 'Save' : 'Add goal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalCard({ websiteId, goal, onEdit }: { websiteId: string; goal: Goal; onEdit: () => void }) {
  const { data, isPending } = useAnalyticsQuery<{ num: number; total: number }>(
    websiteId,
    `goals/${goal.id}/stats`,
  );
  const num = Number(data?.num ?? 0);
  const total = Number(data?.total ?? 0);
  const rate = total ? (num / total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{goal.name}</CardTitle>
        <CardDescription className="truncate">
          {goal.parameters.type === 'path' ? 'Viewed ' : 'Triggered '}
          <span className="font-mono">{goal.parameters.value}</span>
        </CardDescription>
        <CardAction>
          <DefinitionActions websiteId={websiteId} kind="goals" id={goal.id} name={goal.name} onEdit={onEdit} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isPending ? (
          <Skeleton className="h-14 w-full" />
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-semibold tabular-nums">{rate.toFixed(1)}%</span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatLongNumber(num)} of {formatLongNumber(total)} visitors
              </span>
            </div>
            <Progress value={rate} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function GoalsView() {
  const { id, canUpdate } = useCurrentWebsite();
  const { data, isPending } = useDefinitions<GoalParameters>(id, 'goals');
  const [editing, setEditing] = useState<Goal | 'new' | null>(null);
  const goals = data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <WebsiteHeader title="Goals" />
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Conversion rate of each goal for the selected period.</p>
        {canUpdate && (
          <Button onClick={() => setEditing('new')}>
            <Plus data-icon="inline-start" />
            Add goal
          </Button>
        )}
      </div>

      {isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map(i => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Target />
            </EmptyMedia>
            <EmptyTitle>No goals yet</EmptyTitle>
            <EmptyDescription>
              Track conversions like reaching a thank-you page or clicking “Sign up”.
            </EmptyDescription>
          </EmptyHeader>
          {canUpdate && (
            <EmptyContent>
              <Button onClick={() => setEditing('new')}>Add goal</Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {goals.map(goal => (
            <GoalCard key={goal.id} websiteId={id} goal={goal} onEdit={() => setEditing(goal)} />
          ))}
        </div>
      )}

      {editing && (
        <GoalDialog
          websiteId={id}
          goal={editing === 'new' ? undefined : editing}
          onOpenChange={open => !open && setEditing(null)}
        />
      )}
    </div>
  );
}
