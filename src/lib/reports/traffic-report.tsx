/*
 * The standard traffic report: one site, one period, on a page or two.
 *
 * Built to be handed to a client, so it leads with the figures someone
 * non-technical asks for — how many people, how many pages, are we up or down
 * — and only then breaks down where they came from and what they looked at.
 */
import { Text, View } from '@react-pdf/renderer';
import { COLOR, CONTENT_WIDTH, FONT, SIZE, SPACE, TERMINAL } from './theme';
import { CoverPage, type CoverStat, type TerminalLine } from './cover';
import {
  ActivityGrid,
  BarList,
  Donut,
  LineChart,
  Panel,
  ReportDocument,
  ReportPage,
  Section,
  SplitBar,
  Table,
  TileRow,
  type ReportMeta,
  type Tile,
} from './template';
import type { TrafficReportData } from './traffic-data';

const number = (value: number) => Math.round(value).toLocaleString('en-GB');

const percent = (value: number) => `${Math.round(value * 100)}%`;

function duration(seconds: number) {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return minutes ? `${minutes}m ${total % 60}s` : `${total}s`;
}

/**
 * The change against the previous period, and whether that change is good
 * news. Returned together because "down 12%" is an improvement for bounce rate
 * and a problem for visitors — the arrow has to know which measure it is on.
 */
function delta(
  current: number,
  previous: number,
  { lowerIsBetter = false }: { lowerIsBetter?: boolean } = {},
): Pick<Tile, 'delta' | 'direction'> {
  if (!previous) {
    return current ? { delta: 'no comparison', direction: 'flat' } : {};
  }

  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return { delta: 'level on last period', direction: 'flat' };

  const better = lowerIsBetter ? change < 0 : change > 0;

  return {
    delta: `${change > 0 ? '+' : ''}${change}% on last period`,
    direction: better ? 'up' : 'down',
  };
}

/**
 * Core Web Vitals against Google's published bands: good / needs improvement /
 * poor. The colour here is a status, not a series — it says whether a number
 * is acceptable, which is exactly what status colour is reserved for.
 */
function vitalTiles(vitals: NonNullable<TrafficReportData['vitals']>): Tile[] {
  const band = (value: number | null, good: number, poor: number): Tile['direction'] =>
    value === null ? 'flat' : value <= good ? 'up' : value >= poor ? 'down' : 'flat';

  const ms = (value: number | null) =>
    value === null ? '—' : value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;

  const verdict = (value: number | null, good: number, poor: number) =>
    value === null ? undefined : value <= good ? 'Good' : value >= poor ? 'Poor' : 'Needs work';

  return [
    {
      label: 'Largest paint',
      value: ms(vitals.lcp),
      delta: verdict(vitals.lcp, 2500, 4000),
      direction: band(vitals.lcp, 2500, 4000),
    },
    {
      label: 'Interaction',
      value: ms(vitals.inp),
      delta: verdict(vitals.inp, 200, 500),
      direction: band(vitals.inp, 200, 500),
    },
    {
      label: 'Layout shift',
      value: vitals.cls === null ? '—' : vitals.cls.toFixed(2),
      delta: verdict(vitals.cls, 0.1, 0.25),
      direction: band(vitals.cls, 0.1, 0.25),
    },
  ];
}

export interface TrafficReportProps {
  meta: ReportMeta;
  data: TrafficReportData;
}

export function TrafficReport({ meta, data }: TrafficReportProps) {
  const headline: Tile[] = [
    {
      label: 'Visitors',
      value: number(data.visitors),
      ...delta(data.visitors, data.previous.visitors),
    },
    { label: 'Page views', value: number(data.views), ...delta(data.views, data.previous.views) },
    { label: 'Visits', value: number(data.visits), ...delta(data.visits, data.previous.visits) },
    {
      label: 'Bounce rate',
      value: percent(data.bounceRate),
      ...delta(data.bounceRate, data.previous.bounceRate, { lowerIsBetter: true }),
    },
    { label: 'Avg. visit', value: duration(data.visitTime) },
  ];

  const viewsPerVisit = data.visits ? data.views / data.visits : 0;
  const change = data.previous.visitors
    ? Math.round(((data.visitors - data.previous.visitors) / data.previous.visitors) * 100)
    : null;

  const summary =
    `${number(data.visitors)} people made ${number(data.visits)} visits and looked at ` +
    `${number(data.views)} pages` +
    (change === null
      ? '.'
      : `, ${change === 0 ? 'level with' : `${Math.abs(change)}% ${change > 0 ? 'up on' : 'down on'}`} the period before.`);

  // The cover's terminal output: the headline figures in the product's own
  // voice, rather than a second copy of the summary sentence.
  const signed = (value: number | null) =>
    value === null ? 'n/a' : `${value > 0 ? '+' : ''}${value}%`;

  const tone = (value: number | null, lowerIsBetter = false) => {
    if (value === null || value === 0) return TERMINAL.dim;
    return (lowerIsBetter ? value < 0 : value > 0) ? TERMINAL.ok : TERMINAL.warn;
  };

  const bounceChange = data.previous.bounceRate
    ? Math.round(((data.bounceRate - data.previous.bounceRate) / data.previous.bounceRate) * 100)
    : null;
  const viewsChange = data.previous.views
    ? Math.round(((data.views - data.previous.views) / data.previous.views) * 100)
    : null;

  const terminal: TerminalLine[] = [
    { command: 'period', target: meta.period, status: 'OK', tone: TERMINAL.info },
    {
      command: 'visitors',
      target: number(data.visitors),
      status: signed(change),
      tone: tone(change),
    },
    {
      command: 'views',
      target: number(data.views),
      status: signed(viewsChange),
      tone: tone(viewsChange),
    },
    {
      command: 'bounce',
      target: percent(data.bounceRate),
      status: signed(bounceChange),
      tone: tone(bounceChange, true),
    },
    {
      command: 'channels',
      target: data.channels[0]?.label.toLowerCase() ?? 'none recorded',
      status: data.channels.length ? `${data.channels.length}` : '0',
      tone: TERMINAL.info,
    },
  ];

  const stats: CoverStat[] = [
    { value: number(data.visitors), label: 'Visitors', tone: TERMINAL.info },
    { value: number(data.views), label: 'Page views', tone: TERMINAL.violet },
    { value: percent(data.bounceRate), label: 'Bounce', tone: TERMINAL.ok },
  ];

  return (
    <ReportDocument meta={meta}>
      <CoverPage meta={meta} summary={summary} terminal={terminal} stats={stats} />

      <ReportPage meta={meta}>
        <Section
          title="At a glance"
          note="Compared with the period of the same length immediately before this one."
        >
          <TileRow tiles={headline} />
        </Section>

        <Section title="Traffic over the period">
          <Panel>
            <LineChart
              series={[
                { label: 'Page views', points: data.daily.views },
                { label: 'Visitors', points: data.daily.visitors },
              ]}
            />
          </Panel>
        </Section>

        <Section
          title="Who visited and how they arrived"
          note="Share of visits by channel, and whether people had been to the site before."
        >
          <Panel>
            <Donut rows={data.channels} />
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: COLOR.border,
                marginTop: SPACE.md,
                paddingTop: SPACE.md,
              }}
            >
              <SplitBar
                parts={[
                  { label: 'First-time', value: data.visitorTypes.newVisitors },
                  { label: 'Returning', value: data.visitorTypes.returningVisitors },
                ]}
              />
            </View>
          </Panel>
        </Section>

        <Section title="Most visited pages" note={`Top ${data.pages.length} by page views.`}>
          <Table
            columns={[
              { header: 'Page', width: 4, cell: row => row.label },
              {
                header: 'Views',
                width: 1,
                align: 'right',
                cell: row => number(row.value),
              },
            ]}
            rows={data.pages}
            emptyText="No pages were viewed in this period."
          />
        </Section>

        <Section
          title="When visitors are active"
          note="Visitors by day and hour, in UTC. Brighter squares are busier hours."
        >
          <Panel>
            <ActivityGrid days={data.activity} />
          </Panel>
        </Section>

        {data.vitals ? (
          <Section
            title="How fast the site felt"
            note="Core Web Vitals at the 75th percentile — the experience of the slowest quarter of visits."
          >
            <TileRow tiles={vitalTiles(data.vitals)} />
          </Section>
        ) : null}

        <Section title="Where visitors came from" note="The site or search engine that sent them.">
          <BarList rows={data.referrers} id="referrers" />
        </Section>

        <Section title="Countries" note="By number of visitors.">
          <BarList rows={data.countries} id="countries" />
        </Section>

        <View style={{ flexDirection: 'row', gap: SPACE.lg }} wrap={false}>
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            <Section title="Devices">
              <BarList rows={data.devices} width={CONTENT_WIDTH / 2 - SPACE.lg} id="devices" />
            </Section>
          </View>
          <View style={{ flexGrow: 1, flexBasis: 0 }}>
            <Section title="Browsers">
              <BarList rows={data.browsers} width={CONTENT_WIDTH / 2 - SPACE.lg} id="browsers" />
            </Section>
          </View>
        </View>

        <Section title="What the figures mean">
          <Glossary
            entries={[
              [
                'Visitors',
                'Distinct people, counted once each however many times they came back in the period.',
              ],
              [
                'Visits',
                `Separate sessions. ${number(data.visits)} visits from ${number(data.visitors)} visitors means people came back rather than arriving once.`,
              ],
              [
                'Page views',
                `Pages loaded in total — ${viewsPerVisit.toFixed(1)} per visit on average.`,
              ],
              [
                'Bounce rate',
                'The share of visits that ended on the page they started on. High is not automatically bad: it is normal for a page that answers the question on its own.',
              ],
              [
                'Where visitors came from',
                'Taken from the referring site. Traffic with no referrer — typed in, a bookmark, or an app that strips it — is shown as direct.',
              ],
              [
                'Returning visitors',
                'Someone seen on the site before this period began. Recognition is by browser and device, so clearing cookies or switching phone to laptop makes the same person look new — read it as a guide to loyalty, not a headcount.',
              ],
              [
                'Channels',
                'How a visit arrived: a search engine, a link on another site, a campaign, or straight to the address. Grouped from the referrer and any campaign tags on the link.',
              ],
              ...(data.vitals
                ? ([
                    [
                      'Core Web Vitals',
                      'Google’s measures of loading (LCP), responsiveness (INP) and layout stability (CLS), taken from real visits rather than a lab test. The 75th percentile is the standard: it describes the slowest quarter, not the average.',
                    ],
                  ] as [string, string][])
                : []),
            ]}
          />
        </Section>
      </ReportPage>
    </ReportDocument>
  );
}

/** Kept local: the glossary is particular to this report, not template furniture. */
function Glossary({ entries }: { entries: [string, string][] }) {
  return (
    <View style={{ gap: SPACE.sm }}>
      {entries.map(([term, meaning]) => (
        <View key={term} wrap={false}>
          <Text style={{ fontSize: SIZE.small, fontFamily: FONT.bold, color: COLOR.text }}>
            {term}
          </Text>
          <Text style={{ fontSize: SIZE.small, color: COLOR.textSecondary, marginTop: 1 }}>
            {meaning}
          </Text>
        </View>
      ))}
    </View>
  );
}
