/*
 * The widgets a board can hold: names, categories and settings. Metadata only (no React), so
 * it can be tested and used by the editor; the renderers live in components/boards/widgets.
 * Type names match Umami's board components, so boards stay compatible.
 */
import { BOARD_COMPONENT_COMPATIBILITY_MATRIX } from './boardComponentCompatibility';
import type { BoardEntityType } from './boards';

export interface ConfigOption {
  label: string;
  value: string;
}

export interface ConfigField {
  name: string;
  label: string;
  type: 'select' | 'text' | 'textarea' | 'report';
  options?: ConfigOption[];
  /** Options that depend on what the widget shows (links and pixels have fewer metrics). */
  optionsByEntityType?: Partial<Record<BoardEntityType, ConfigOption[]>>;
  /** For 'report' fields: which saved reports to choose from. */
  reportType?: 'goals' | 'funnels';
  defaultValue?: string;
  required?: boolean;
}

export interface ComponentDefinition {
  type: string;
  name: string;
  description: string;
  category: (typeof CATEGORIES)[number]['key'];
  /** Shows data for a website, link or pixel (everything but text blocks). */
  needsEntity: boolean;
  configFields?: ConfigField[];
}

export const CATEGORIES = [
  { key: 'overview', name: 'Overview' },
  { key: 'tables', name: 'Tables' },
  { key: 'visualization', name: 'Charts' },
  { key: 'content', name: 'Content' },
] as const;

const WEBSITE_METRICS: ConfigOption[] = [
  { label: 'Pages', value: 'path' },
  { label: 'Entry pages', value: 'entry' },
  { label: 'Exit pages', value: 'exit' },
  { label: 'Page titles', value: 'title' },
  { label: 'Query strings', value: 'query' },
  { label: 'Referrers', value: 'referrer' },
  { label: 'Channels', value: 'channel' },
  { label: 'Countries', value: 'country' },
  { label: 'Regions', value: 'region' },
  { label: 'Cities', value: 'city' },
  { label: 'Browsers', value: 'browser' },
  { label: 'Operating systems', value: 'os' },
  { label: 'Devices', value: 'device' },
  { label: 'Languages', value: 'language' },
  { label: 'Events', value: 'event' },
];

// Links and pixels have one "page", so page-level metrics don't apply.
const OVERVIEW_METRIC_VALUES = [
  'referrer',
  'channel',
  'country',
  'region',
  'city',
  'browser',
  'os',
  'device',
];
const OVERVIEW_METRICS = OVERVIEW_METRIC_VALUES.map(value =>
  WEBSITE_METRICS.find(metric => metric.value === value)!,
);

const LIMITS: ConfigOption[] = ['5', '10', '20'].map(value => ({ label: `Top ${value}`, value }));

export const COMPONENTS: ComponentDefinition[] = [
  {
    type: 'WebsiteMetricsBar',
    name: 'Metrics bar',
    description: 'Visitors, visits, views, bounce rate and visit duration.',
    category: 'overview',
    needsEntity: true,
  },
  {
    type: 'RealtimeActiveUsers',
    name: 'Active visitors',
    description: 'People on the site right now.',
    category: 'overview',
    needsEntity: true,
  },
  {
    type: 'Goal',
    name: 'Goal',
    description: 'Conversion rate of a saved goal.',
    category: 'overview',
    needsEntity: true,
    configFields: [
      { name: 'reportId', label: 'Goal', type: 'report', reportType: 'goals', required: true },
    ],
  },
  {
    type: 'Funnel',
    name: 'Funnel',
    description: 'Drop-off through a saved funnel.',
    category: 'overview',
    needsEntity: true,
    configFields: [
      { name: 'reportId', label: 'Funnel', type: 'report', reportType: 'funnels', required: true },
    ],
  },
  {
    type: 'MetricsTable',
    name: 'Metrics table',
    description: 'Top pages, sources, locations or technology.',
    category: 'tables',
    needsEntity: true,
    configFields: [
      {
        name: 'type',
        label: 'Show',
        type: 'select',
        options: WEBSITE_METRICS,
        optionsByEntityType: { pixel: OVERVIEW_METRICS, link: OVERVIEW_METRICS },
        defaultValue: 'path',
      },
      { name: 'limit', label: 'Rows', type: 'select', options: LIMITS, defaultValue: '10' },
    ],
  },
  {
    type: 'WebsiteChart',
    name: 'Visitors chart',
    description: 'Visitors and page views over time.',
    category: 'visualization',
    needsEntity: true,
  },
  {
    type: 'EventsChart',
    name: 'Events chart',
    description: 'Custom events over time.',
    category: 'visualization',
    needsEntity: true,
  },
  {
    type: 'WeeklyTraffic',
    name: 'Weekly traffic',
    description: 'Busiest days and hours.',
    category: 'visualization',
    needsEntity: true,
  },
  {
    type: 'WorldMap',
    name: 'World map',
    description: 'Visitors by country.',
    category: 'visualization',
    needsEntity: true,
  },
  {
    type: 'TextBlock',
    name: 'Text',
    description: 'A heading and notes.',
    category: 'content',
    needsEntity: false,
    configFields: [{ name: 'text', label: 'Text', type: 'textarea' }],
  },
];

export function getComponentDefinition(type: string) {
  return COMPONENTS.find(component => component.type === type);
}

/** Widgets that can show data for this kind of entity (see the compatibility matrix). */
export function getComponentsForEntity(entityType: BoardEntityType) {
  return COMPONENTS.filter(component => {
    const supported = (BOARD_COMPONENT_COMPATIBILITY_MATRIX as Record<string, readonly string[]>)[
      component.type
    ];
    return !supported || supported.includes(entityType);
  });
}

/** A field's options for an entity type (falls back to the field's general options). */
export function getFieldOptions(field: ConfigField, entityType?: BoardEntityType) {
  return (entityType && field.optionsByEntityType?.[entityType]) ?? field.options ?? [];
}
