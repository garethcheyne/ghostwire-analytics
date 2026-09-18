'use client';
import { Globe, Info, Pencil, Save, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DateRangePicker } from '@/components/analytics/date-range-picker';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useDashboard, useSaveDashboard } from '@/hooks/queries/boards';
import type { BoardParameters } from '@/lib/types';
import { BoardCanvas } from './board-canvas';
import { useBoardEntities } from './board-entities';

const STARTER_WEBSITES = 3;

/** Until you customise it: the traffic chart for your first website and stats for a few. */
function starterLayout(websiteIds: string[]): BoardParameters {
  const [first, ...rest] = websiteIds.slice(0, STARTER_WEBSITES);
  if (!first) return { rows: [] };

  const widget = (type: string, id: string) => ({
    type,
    entityType: 'website' as const,
    entityId: id,
    websiteId: id,
  });

  return {
    rows: [
      {
        id: 'starter-stats',
        columns: [{ id: 'starter-stats-1', component: widget('WebsiteMetricsBar', first) }],
      },
      {
        id: 'starter-chart',
        columns: [{ id: 'starter-chart-1', component: widget('WebsiteChart', first) }],
      },
      ...rest.map(id => ({
        id: `starter-${id}`,
        columns: [{ id: `starter-${id}-1`, component: widget('WebsiteMetricsBar', id) }],
      })),
    ],
  };
}

export function DashboardView() {
  const { data: dashboard, isPending } = useDashboard();
  const { data: entities, isPending: entitiesPending } = useBoardEntities();
  const save = useSaveDashboard();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BoardParameters | null>(null);

  const websiteIds = useMemo(
    () => (entities ?? []).filter(entity => entity.type === 'website').map(entity => entity.id),
    [entities],
  );
  const saved = dashboard?.parameters?.rows?.length ? dashboard.parameters : null;
  const isStarter = !saved;
  const parameters = draft ?? saved ?? starterLayout(websiteIds);

  if (isPending || entitiesPending) return <Skeleton className="h-96 w-full" />;

  async function handleSave() {
    try {
      await save.mutateAsync(parameters);
      toast.success('Dashboard saved');
      setDraft(null);
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the dashboard.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your numbers at a glance.">
        {editing ? (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setDraft(null);
                setEditing(false);
              }}
            >
              <X data-icon="inline-start" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={save.isPending}>
              {save.isPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Save data-icon="inline-start" />
              )}
              Save
            </Button>
          </>
        ) : (
          <>
            <DateRangePicker />
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil data-icon="inline-start" />
              Customise
            </Button>
          </>
        )}
      </PageHeader>

      {!websiteIds.length && !saved ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Globe />
            </EmptyMedia>
            <EmptyTitle>Nothing to show yet</EmptyTitle>
            <EmptyDescription>Add a website and its numbers appear here.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href="/websites">Go to websites</Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <>
          {isStarter && !editing && (
            <Alert>
              <Info />
              <AlertDescription>
                A starter dashboard from your websites. Customise it to choose exactly what&apos;s
                here.
              </AlertDescription>
            </Alert>
          )}
          <BoardCanvas parameters={parameters} editing={editing} onChange={setDraft} />
        </>
      )}
    </div>
  );
}
