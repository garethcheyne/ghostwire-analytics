'use client';
import dynamic from 'next/dynamic';
import { EventsChart } from '@/components/analytics/events-chart';
import { MetricsCard } from '@/components/analytics/metrics-card';
import { StatsBar } from '@/components/analytics/stats-bar';
import { TrafficChart } from '@/components/analytics/traffic-chart';
import { WeeklyTraffic } from '@/components/analytics/weekly-traffic';
import { FunnelCard } from '@/components/reports/funnels-view';
import { GoalCard } from '@/components/reports/goals-view';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { WebsiteProvider } from '@/components/websites/website-context';
import { useActiveVisitors } from '@/hooks/queries/analytics';
import {
  type Definition,
  type FunnelParameters,
  type GoalParameters,
  useDefinitions,
} from '@/hooks/queries/definitions';
import { getComponentDefinition, getFieldOptions } from '@/lib/board-components';
import type { BoardEntityType } from '@/lib/boards';
import type { BoardComponentConfig } from '@/lib/types';

// Browser-only, like on the overview (map projection maths differs between server and client).
const WorldMap = dynamic(() => import('@/components/analytics/world-map').then(m => m.WorldMap), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />,
});

function Unavailable({ title, message }: { title: string; message: string }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/** A small label above widgets that have no title of their own. */
function Captioned({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <p className="truncate text-sm font-medium text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function ActiveVisitors({ id, title }: { id: string; title: string }) {
  const { data } = useActiveVisitors(id);

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Right now</CardDescription>
      </CardHeader>
      <CardContent>
        <span className="text-4xl font-semibold tabular-nums">{data?.visitors ?? '–'}</span>
      </CardContent>
    </Card>
  );
}

function SavedReport({
  id,
  kind,
  reportId,
}: {
  id: string;
  kind: 'goals' | 'funnels';
  reportId?: string;
}) {
  const { data, isPending } = useDefinitions<GoalParameters | FunnelParameters>(id, kind);
  const report = data?.data.find(item => item.id === reportId);

  if (isPending) return <Skeleton className="h-40 w-full" />;
  if (!report) {
    return (
      <Unavailable
        title={kind === 'goals' ? 'Goal' : 'Funnel'}
        message="The saved report was deleted. Edit the board to choose another."
      />
    );
  }

  return kind === 'goals' ? (
    <GoalCard websiteId={id} goal={report as Definition<GoalParameters>} />
  ) : (
    <FunnelCard websiteId={id} funnel={report as Definition<FunnelParameters>} />
  );
}

/** Renders one board widget for its website, link or pixel. */
export function BoardWidget({
  config,
  entityName,
}: {
  config: BoardComponentConfig;
  /** Name of the website/link/pixel, used as a default title. */
  entityName?: string;
}) {
  const definition = getComponentDefinition(config.type);
  const props = config.props ?? {};
  const id = config.entityId ?? config.websiteId;
  const entityType = (config.entityType ?? 'website') as BoardEntityType;
  const title = config.title || (entityName ? `${entityName}` : definition?.name) || 'Widget';

  if (!definition) {
    return <Unavailable title="Unknown widget" message={`“${config.type}” isn't available.`} />;
  }

  if (config.type === 'TextBlock') {
    return (
      <Card className="h-full">
        {config.title && (
          <CardHeader>
            <CardTitle>{config.title}</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{props.text}</p>
        </CardContent>
      </Card>
    );
  }

  if (!id) {
    return <Unavailable title={definition.name} message="Choose what this widget shows." />;
  }

  const metricType = props.type ?? 'path';
  const typeField = definition.configFields?.find(field => field.name === 'type');
  const metricLabel = typeField
    ? getFieldOptions(typeField, entityType).find(option => option.value === metricType)?.label
    : undefined;

  const content = (() => {
    switch (config.type) {
      case 'WebsiteMetricsBar':
        return (
          <Captioned title={title}>
            <StatsBar websiteId={id} />
          </Captioned>
        );
      case 'WebsiteChart':
        return (
          <Captioned title={title}>
            <TrafficChart websiteId={id} />
          </Captioned>
        );
      case 'EventsChart':
        return (
          <Card className="h-full">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>Custom events</CardDescription>
            </CardHeader>
            <CardContent>
              <EventsChart websiteId={id} />
            </CardContent>
          </Card>
        );
      case 'WeeklyTraffic':
        return (
          <Captioned title={title}>
            <WeeklyTraffic websiteId={id} />
          </Captioned>
        );
      case 'WorldMap':
        return <WorldMap websiteId={id} title={title} />;
      case 'MetricsTable':
        return (
          <MetricsCard
            websiteId={id}
            title={
              config.title || `${metricLabel ?? 'Metrics'}${entityName ? ` · ${entityName}` : ''}`
            }
            tabs={[{ type: metricType, label: metricLabel ?? metricType }]}
            limit={Number(props.limit ?? 10)}
          />
        );
      case 'RealtimeActiveUsers':
        return <ActiveVisitors id={id} title={title} />;
      case 'Goal':
        return <SavedReport id={id} kind="goals" reportId={props.reportId} />;
      case 'Funnel':
        return <SavedReport id={id} kind="funnels" reportId={props.reportId} />;
      default:
        return <Unavailable title={definition.name} message="This widget can't be shown." />;
    }
  })();

  // The analytics components read the current website from context (e.g. for notes).
  return (
    <WebsiteProvider
      website={{
        id,
        name: entityName ?? title,
        domain: null,
        teamId: null,
        userId: null,
        canUpdate: false,
        canDelete: false,
        kind: entityType,
      }}
    >
      {content}
    </WebsiteProvider>
  );
}
