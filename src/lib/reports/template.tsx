/*
 * The report template: the frame and the building blocks every generated PDF
 * report shares.
 *
 * A new report in the range should need only a data shape and a body built
 * from these pieces — page furniture, branding, spacing and the type scale all
 * come from here, so the set stays recognisably one family.
 *
 * Nothing here fetches anything. Fonts are the PDF built-ins and the logo is
 * read from disk, so rendering works offline and in a container with no
 * network.
 */
import {
  Circle,
  Defs,
  Document,
  Image,
  LinearGradient,
  Page,
  Path,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  Text,
  View,
  Line as SvgLine,
} from '@react-pdf/renderer';
import { ghostwireLogo } from './brand';
import { COLOR, CONTENT_WIDTH, FONT, PAGE, SIZE, SPACE } from './theme';

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT.family,
    fontSize: SIZE.body,
    color: COLOR.text,
    backgroundColor: COLOR.page,
    paddingTop: PAGE.margin + PAGE.headerHeight,
    paddingBottom: PAGE.footerHeight + SPACE.md,
    paddingHorizontal: PAGE.margin,
  },
  cover: {
    fontFamily: FONT.family,
    color: COLOR.text,
    backgroundColor: COLOR.page,
    padding: 0,
  },

  header: {
    position: 'absolute',
    top: PAGE.margin,
    left: PAGE.margin,
    right: PAGE.margin,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  headerMark: { width: 18, height: 18 },
  headerSite: { fontFamily: FONT.bold, fontSize: SIZE.section, color: COLOR.text },
  headerTitle: { fontSize: SIZE.small, color: COLOR.textSecondary },
  headerPeriod: { fontSize: SIZE.small, color: COLOR.textMuted, marginLeft: 'auto' },

  footer: {
    position: 'absolute',
    bottom: PAGE.margin - 14,
    left: PAGE.margin,
    right: PAGE.margin,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLOR.border,
    paddingTop: SPACE.sm,
  },
  footerText: { fontSize: SIZE.tiny, color: COLOR.textMuted },

  section: { marginBottom: SPACE.lg },
  sectionHead: { marginBottom: SPACE.sm },
  sectionTitle: { fontFamily: FONT.bold, fontSize: SIZE.section, color: COLOR.text },
  sectionNote: { fontSize: SIZE.small, color: COLOR.textMuted, marginTop: 1 },

  tileRow: { flexDirection: 'row', gap: SPACE.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 6,
    backgroundColor: COLOR.card,
    paddingTop: SPACE.md - 2,
    paddingBottom: SPACE.md,
    paddingHorizontal: SPACE.md,
  },
  tileLabel: { fontSize: SIZE.tiny, color: COLOR.textSecondary, textTransform: 'uppercase' },
  tileValue: { fontFamily: FONT.bold, fontSize: SIZE.title, marginTop: SPACE.xs, color: COLOR.text },
  tileDelta: { fontSize: SIZE.tiny, marginTop: 3 },

  panel: {
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 6,
    backgroundColor: COLOR.card,
    padding: SPACE.md,
  },

  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLOR.borderStrong,
    paddingBottom: SPACE.xs,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLOR.border,
    paddingVertical: 5,
  },
  th: { fontFamily: FONT.bold, fontSize: SIZE.tiny, color: COLOR.textSecondary },
  td: { fontSize: SIZE.small, color: COLOR.text },
  rank: { fontSize: SIZE.tiny, color: COLOR.textMuted },

  legend: { flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  legendLabel: { fontSize: SIZE.small, color: COLOR.textSecondary },

  empty: {
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 6,
    padding: SPACE.lg,
    alignItems: 'center',
  },
  emptyText: { fontSize: SIZE.small, color: COLOR.textMuted },
});

/** The suite's cyan→purple gradient, as an SVG rule. Decoration, never data. */
export function GradientRule({
  width = CONTENT_WIDTH,
  height = 3,
}: {
  width?: number;
  height?: number;
}) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="ghostwire-rule" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={COLOR.gradientFrom} />
          <Stop offset="1" stopColor={COLOR.gradientTo} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} rx={height / 2} fill="url(#ghostwire-rule)" />
    </Svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Page frame                                                                  */
/* -------------------------------------------------------------------------- */

export interface ReportMeta {
  /** The site the report is about — the headline on the cover and every page. */
  siteName: string;
  /** Which report this is, e.g. "Traffic report". */
  title: string;
  /** Human-readable period, e.g. "1–30 September 2026". */
  period: string;
  /** When it was produced. */
  generatedAt: Date;
}

/**
 * A content page. The header and footer are `fixed`, so they repeat on every
 * page a long report spills onto without the body having to know.
 */
export function ReportPage({ meta, children }: { meta: ReportMeta; children: React.ReactNode }) {
  const logo = ghostwireLogo();

  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header} fixed>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- see above: this is not an <img>. */}
        {logo ? <Image src={logo} style={styles.headerMark} /> : null}
        <View>
          <Text style={styles.headerSite}>{meta.siteName}</Text>
          <Text style={styles.headerTitle}>{meta.title}</Text>
        </View>
        <Text style={styles.headerPeriod}>{meta.period}</Text>
      </View>
      <View
        style={{
          position: 'absolute',
          top: PAGE.margin + 38,
          left: PAGE.margin,
          right: PAGE.margin,
        }}
        fixed
      >
        <GradientRule height={2} />
      </View>

      {children}

      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>
          {meta.siteName} · {meta.title} · Generated by Ghostwire Analytics
        </Text>
        <Text
          style={styles.footerText}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </Page>
  );
}

/** The document wrapper, with the metadata a PDF reader shows in its title bar. */
export function ReportDocument({ meta, children }: { meta: ReportMeta; children: React.ReactNode }) {
  return (
    <Document
      title={`${meta.siteName} — ${meta.title}`}
      author="Ghostwire Analytics"
      subject={meta.period}
      creator="Ghostwire Analytics"
      producer="Ghostwire Analytics"
    >
      {children}
    </Document>
  );
}

/* -------------------------------------------------------------------------- */
/* Building blocks                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A titled block.
 *
 * Sections do not split across pages by default. A list broken mid-way leaves
 * its continuation stranded on the next page under no heading, which in a
 * document going to a client reads as a fault rather than as a page break —
 * whitespace at the foot of a page does not. Pass `wrap` for a section long
 * enough that keeping it whole would cost more than it saves.
 */
export function Section({
  title,
  note,
  children,
  wrap = false,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
  wrap?: boolean;
}) {
  return (
    <View style={styles.section} wrap={wrap}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export interface Tile {
  label: string;
  value: string;
  /** Change against the previous period, already formatted (e.g. "+12%"). */
  delta?: string;
  /** Which way is good. Bounce rate going up is not an improvement. */
  direction?: 'up' | 'down' | 'flat';
}

/**
 * A row of headline figures. Five is the practical ceiling on A4 before the
 * numbers stop being readable — past that, split into two rows.
 */
export function TileRow({ tiles }: { tiles: Tile[] }) {
  return (
    <View style={styles.tileRow}>
      {tiles.map(tile => (
        <View key={tile.label} style={styles.tile}>
          {/* A short bar of brand colour at the top of each card. */}
          <View style={{ marginBottom: SPACE.sm }}>
            <GradientRule width={22} height={2} />
          </View>
          <Text style={styles.tileLabel}>{tile.label}</Text>
          <Text style={styles.tileValue}>{tile.value}</Text>
          {tile.delta ? (
            <Text
              style={[
                styles.tileDelta,
                {
                  color:
                    tile.direction === 'up'
                      ? COLOR.positive
                      : tile.direction === 'down'
                        ? COLOR.negative
                        : COLOR.textMuted,
                },
              ]}
            >
              {tile.delta}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/** A card, for grouping a chart or a list on the dark page. */
export function Panel({ children }: { children: React.ReactNode }) {
  return <View style={styles.panel}>{children}</View>;
}

export interface Column<T> {
  header: string;
  /** Share of the table width, as a flex weight. */
  width: number;
  cell: (row: T) => string;
  align?: 'left' | 'right';
}

/**
 * The form for anything with more than a handful of named classes: top pages,
 * sources, countries. A table reads better than a chart the moment the labels
 * are long, which for URLs and referrers is immediately.
 */
export function Table<T>({
  columns,
  rows,
  emptyText = 'Nothing recorded in this period.',
}: {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
}) {
  if (!rows.length) return <Empty text={emptyText} />;

  return (
    <View>
      <View style={styles.tableHead}>
        <Text style={[styles.th, { width: 18 }]}> </Text>
        {columns.map(column => (
          <Text
            key={column.header}
            style={[
              styles.th,
              { flexGrow: column.width, flexBasis: 0, textAlign: column.align ?? 'left' },
            ]}
          >
            {column.header}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={index} style={styles.tableRow} wrap={false}>
          <Text style={[styles.rank, { width: 18 }]}>{index + 1}</Text>
          {columns.map(column => (
            <Text
              key={column.header}
              style={[
                styles.td,
                { flexGrow: column.width, flexBasis: 0, textAlign: column.align ?? 'left' },
              ]}
            >
              {column.cell(row)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Charts                                                                      */
/* -------------------------------------------------------------------------- */

export interface Series {
  label: string;
  points: { x: string; y: number }[];
}

/**
 * The nearest round number at or above the peak, from a fine set of steps per
 * decade. Coarser steps waste the plot: a peak of 1,050 against a ceiling of
 * 2,000 leaves the whole series squashed into the bottom half of the chart.
 */
export function niceCeiling(max: number) {
  if (max <= 5) return 5;

  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step =
    [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(candidate => max <= candidate * magnitude) ?? 10;

  return step * magnitude;
}

const compact = (value: number) =>
  value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(Math.round(value));

/**
 * A line chart for change over time, with the leading series filled.
 *
 * One shared y-axis for both series — never a second axis: two scales on one
 * plot make any crossing point look meaningful when it is an artefact of the
 * scaling. Views always exceed visitors, so the two sit naturally on one axis.
 *
 * Each line is labelled at its right-hand end as well as in the legend, so the
 * two are told apart by position and text, not by colour alone.
 */
export function LineChart({
  series,
  width = CONTENT_WIDTH - SPACE.md * 2,
  height = 180,
}: {
  series: Series[];
  width?: number;
  height?: number;
}) {
  const padding = { top: 12, right: 52, bottom: 22, left: 34 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const length = Math.max(...series.map(s => s.points.length), 0);
  if (!length) return <Empty text="No traffic recorded in this period." />;

  const peak = Math.max(1, ...series.flatMap(s => s.points.map(p => p.y)));
  const ceiling = niceCeiling(peak);

  // A single point would divide by zero; park it in the middle instead.
  const xAt = (index: number) =>
    padding.left + (length === 1 ? plotWidth / 2 : (index / (length - 1)) * plotWidth);
  const yAt = (value: number) => padding.top + plotHeight - (value / ceiling) * plotHeight;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map(fraction => fraction * ceiling);
  const tickIndexes = length <= 2 ? [0, length - 1] : [0, Math.floor((length - 1) / 2), length - 1];

  const linePath = (points: Series['points']) =>
    points.map((point, index) => `${index ? 'L' : 'M'}${xAt(index)},${yAt(point.y)}`).join(' ');

  return (
    <View>
      <View style={styles.legend}>
        {series.map((s, index) => (
          <View key={s.label} style={styles.legendItem}>
            <Svg width={10} height={10}>
              <Rect x={0} y={3} width={10} height={4} rx={2} fill={COLOR.series[index]} />
            </Svg>
            <Text style={styles.legendLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={COLOR.series[0]} stopOpacity={0.55} />
            <Stop offset="1" stopColor={COLOR.series[0]} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {gridValues.map(value => (
          <SvgLine
            key={value}
            x1={padding.left}
            y1={yAt(value)}
            x2={width - padding.right}
            y2={yAt(value)}
            strokeWidth={1}
            stroke={value === 0 ? COLOR.borderStrong : COLOR.border}
          />
        ))}

        {gridValues.map(value => (
          <Text
            key={`label-${value}`}
            x={padding.left - 6}
            y={yAt(value) + 3}
            style={{ fontSize: SIZE.tiny, fill: COLOR.textMuted, textAnchor: 'end' }}
          >
            {compact(value)}
          </Text>
        ))}

        {tickIndexes.map(index => (
          <Text
            key={`tick-${index}`}
            x={xAt(index)}
            y={height - 6}
            style={{
              fontSize: SIZE.tiny,
              fill: COLOR.textMuted,
              textAnchor: index === 0 ? 'start' : index === length - 1 ? 'end' : 'middle',
            }}
          >
            {series[0].points[index]?.x ?? ''}
          </Text>
        ))}

        {/* The leading series is filled to the baseline; the rest are lines. */}
        <Path
          d={`${linePath(series[0].points)} L${xAt(series[0].points.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`}
          fill="url(#area-fill)"
          stroke="none"
        />

        {series.map((s, seriesIndex) => (
          <Path
            key={s.label}
            d={linePath(s.points)}
            stroke={COLOR.series[seriesIndex]}
            strokeWidth={2}
            fill="none"
          />
        ))}

        {/* Direct labels at the right-hand end: identity without colour alone. */}
        {series.map((s, seriesIndex) => {
          const last = s.points[s.points.length - 1];
          if (!last) return null;

          return (
            <Text
              key={`direct-${s.label}`}
              x={width - padding.right + 8}
              y={yAt(last.y) + 3}
              style={{ fontSize: SIZE.tiny, fill: COLOR.series[seriesIndex], textAnchor: 'start' }}
            >
              {compact(last.y)}
            </Text>
          );
        })}

        {/* Markers only when the points are sparse enough to read as points. */}
        {length <= 14
          ? series.flatMap((s, seriesIndex) =>
              s.points.map((point, index) => (
                <Circle
                  key={`${s.label}-${index}`}
                  cx={xAt(index)}
                  cy={yAt(point.y)}
                  r={2.5}
                  fill={COLOR.series[seriesIndex]}
                  stroke={COLOR.card}
                  strokeWidth={1}
                />
              )),
            )
          : null}
      </Svg>
    </View>
  );
}

/**
 * A horizontal bar beside a label — for ranked magnitude where the labels are
 * short enough to sit in a column. One fill for every bar: these are ranks of
 * the same measure, not different things.
 */
export function BarList({
  rows,
  width = CONTENT_WIDTH,
  /**
   * Distinguishes this list's gradient from any other on the page. SVG
   * gradient ids are document-wide, so two lists sharing one would have the
   * second silently pick up the first's geometry.
   */
  id = 'bars',
}: {
  rows: { label: string; value: number }[];
  width?: number;
  id?: string;
}) {
  if (!rows.length) return <Empty text="Nothing recorded in this period." />;

  const peak = Math.max(...rows.map(row => row.value), 1);
  const labelWidth = Math.min(150, width * 0.36);
  const valueWidth = 46;
  const barWidth = width - labelWidth - valueWidth;
  const gradientId = `bar-fill-${id}`;

  return (
    <View>
      {rows.map(row => (
        <View
          key={row.label}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3.5 }}
          wrap={false}
        >
          <Text style={[styles.td, { width: labelWidth }]}>{row.label}</Text>
          <Svg width={barWidth} height={10}>
            <Defs>
              {/*
                Measured against the full track rather than each bar, so the
                gradient reads as a scale: a short bar stops in the cyan, only
                the longest reaches the purple. Per-bar gradients gave every
                row the whole sweep, which made a bar of 68 look as complete
                as one of 1,842.
              */}
              <LinearGradient
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={0}
                x2={barWidth}
                y2={0}
              >
                <Stop offset="0" stopColor={COLOR.gradientFrom} />
                <Stop offset="1" stopColor={COLOR.gradientTo} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={1} width={barWidth} height={8} rx={2} fill={COLOR.raised} />
            <Rect
              x={0}
              y={1}
              width={Math.max(2, (row.value / peak) * barWidth)}
              height={8}
              rx={2}
              fill={`url(#${gradientId})`}
            />
          </Svg>
          <Text style={[styles.td, { width: valueWidth, textAlign: 'right' }]}>
            {row.value.toLocaleString('en-GB')}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * A donut for part-to-whole, at a glance.
 *
 * Capped at six segments with the tail folded into "Other": past that,
 * adjacent slices are too close in angle and hue to tell apart. Every segment
 * carries its name and share in the key beside it, so nothing depends on
 * matching a colour to a slice by eye — which is what makes a donut hard to
 * read when two shares are close. When the comparison itself matters rather
 * than the split, use BarList instead.
 */
export function Donut({
  rows,
  size = 132,
  thickness = 22,
}: {
  rows: { label: string; value: number }[];
  size?: number;
  thickness?: number;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (!total) return <Empty text="Nothing recorded in this period." />;

  const radius = size / 2;
  const inner = radius - thickness;
  const START = -Math.PI / 2; // twelve o'clock

  // Each slice starts where everything before it ended. Derived from a running
  // total rather than by advancing a variable through the map, so rendering
  // stays free of mutation.
  const slices = rows.map((row, index) => {
    const before = rows.slice(0, index).reduce((sum, earlier) => sum + earlier.value, 0);
    const sweep = (row.value / total) * Math.PI * 2;
    const from = START + (before / total) * Math.PI * 2;
    const to = from + sweep;

    const point = (r: number, a: number) =>
      `${radius + r * Math.cos(a)},${radius + r * Math.sin(a)}`;
    // A slice over half the circle needs the large-arc flag, or it is drawn
    // the short way round and the donut comes out inside-out.
    const large = sweep > Math.PI ? 1 : 0;

    return {
      ...row,
      color: COLOR.segments[index % COLOR.segments.length],
      share: row.value / total,
      d: [
        `M${point(radius, from)}`,
        `A${radius},${radius} 0 ${large} 1 ${point(radius, to)}`,
        `L${point(inner, to)}`,
        `A${inner},${inner} 0 ${large} 0 ${point(inner, from)}`,
        'Z',
      ].join(' '),
    };
  });

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.lg }}>
      <Svg width={size} height={size}>
        {slices.map(slice => (
          <Path
            key={slice.label}
            d={slice.d}
            fill={slice.color}
            // A hairline of the surface between segments, so neighbouring
            // slices read as separate even where their hues are close.
            stroke={COLOR.card}
            strokeWidth={1.5}
          />
        ))}
      </Svg>

      <View style={{ flexGrow: 1, flexBasis: 0, gap: 5 }}>
        {slices.map(slice => (
          <View key={slice.label} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
            <Svg width={8} height={8}>
              <Rect x={0} y={0} width={8} height={8} rx={2} fill={slice.color} />
            </Svg>
            <Text style={[styles.td, { flexGrow: 1, flexBasis: 0 }]}>{slice.label}</Text>
            <Text style={[styles.td, { color: COLOR.textSecondary, width: 34, textAlign: 'right' }]}>
              {Math.round(slice.share * 100)}%
            </Text>
            <Text style={[styles.td, { width: 46, textAlign: 'right' }]}>
              {slice.value.toLocaleString('en-GB')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Days as they are indexed by getWeeklyTraffic: 0 is Sunday. */
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * A week × hour grid of activity — when people actually visit.
 *
 * Sequential, one hue, more-is-brighter: every cell measures the same thing,
 * so this is magnitude, not identity. Cells with no activity stay at the
 * surface colour rather than taking the dimmest step, so "nothing happened"
 * and "barely anything happened" are not the same shade.
 */
export function ActivityGrid({
  days,
  width = CONTENT_WIDTH - SPACE.md * 2,
}: {
  days: number[][];
  width?: number;
}) {
  const peak = Math.max(...days.flat(), 0);
  if (!peak) return <Empty text="No activity recorded in this period." />;

  const labelWidth = 26;
  const gap = 1.5;
  const cell = (width - labelWidth - gap * 23) / 24;
  const rowHeight = cell + gap;

  // Linear against the peak, so a cell's brightness is its share of the busiest
  // hour and nothing else. Square-rooting it to "bring out" the quiet hours
  // lifted a near-empty 3am into the same step as a working afternoon, which
  // is the opposite of what the grid is for.
  const stepFor = (value: number) => {
    if (!value) return null;
    const index = Math.floor((value / peak) * COLOR.ramp.length);
    return COLOR.ramp[Math.min(COLOR.ramp.length - 1, index)];
  };

  return (
    <View>
      <Svg width={width} height={rowHeight * 7 + 14}>
        {days.map((hours, day) =>
          hours.map((value, hour) => {
            const fill = stepFor(value);

            return (
              <Rect
                key={`${day}-${hour}`}
                x={labelWidth + hour * (cell + gap)}
                y={day * rowHeight}
                width={cell}
                height={cell}
                rx={1.5}
                fill={fill ?? COLOR.raised}
              />
            );
          }),
        )}

        {DAY_LABELS.map((label, day) => (
          <Text
            key={label}
            x={0}
            y={day * rowHeight + cell / 2 + 2.5}
            style={{ fontSize: SIZE.tiny, fill: COLOR.textMuted }}
          >
            {label}
          </Text>
        ))}

        {[0, 6, 12, 18, 23].map(hour => (
          <Text
            key={`hour-${hour}`}
            x={labelWidth + hour * (cell + gap) + cell / 2}
            y={rowHeight * 7 + 8}
            style={{ fontSize: SIZE.tiny, fill: COLOR.textMuted, textAnchor: 'middle' }}
          >
            {`${hour}`.padStart(2, '0')}
          </Text>
        ))}
      </Svg>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: SPACE.xs }}>
        <Text style={[styles.legendLabel, { fontSize: SIZE.tiny }]}>Quieter</Text>
        <Svg width={COLOR.ramp.length * 12} height={8}>
          {COLOR.ramp.map((step, index) => (
            <Rect key={step} x={index * 12} y={0} width={10} height={8} rx={2} fill={step} />
          ))}
        </Svg>
        <Text style={[styles.legendLabel, { fontSize: SIZE.tiny }]}>Busier</Text>
      </View>
    </View>
  );
}

/**
 * A single bar split into its parts — the form for part-to-whole when there
 * are only two or three of them.
 *
 * A donut of two slices is the classic way to make a simple ratio hard to
 * read: the eye compares angles badly, and the numbers end up in a key beside
 * it anyway. One bar, labelled underneath, says the same thing at a glance.
 */
export function SplitBar({
  parts,
  width = CONTENT_WIDTH - SPACE.md * 2,
  height = 16,
}: {
  parts: { label: string; value: number }[];
  width?: number;
  height?: number;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (!total) return <Empty text="Nothing recorded in this period." />;

  const gap = 2;
  const usable = width - gap * (parts.length - 1);

  const segments = parts.map((part, index) => ({
    ...part,
    color: COLOR.shades[index % COLOR.shades.length],
    share: part.value / total,
    // Offsets come from the running total ahead of each part, so nothing has
    // to be mutated while rendering.
    x:
      (parts.slice(0, index).reduce((sum, earlier) => sum + earlier.value, 0) / total) * usable +
      index * gap,
    width: Math.max(1, (part.value / total) * usable),
  }));

  return (
    <View>
      <Svg width={width} height={height}>
        {segments.map(segment => (
          <Rect
            key={segment.label}
            x={segment.x}
            y={0}
            width={segment.width}
            height={height}
            rx={3}
            fill={segment.color}
          />
        ))}
      </Svg>

      <View style={{ flexDirection: 'row', gap: SPACE.lg, marginTop: SPACE.sm }}>
        {segments.map(segment => (
          <View key={segment.label} style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
            <Svg width={8} height={8}>
              <Rect x={0} y={0} width={8} height={8} rx={2} fill={segment.color} />
            </Svg>
            <Text style={styles.td}>{segment.label}</Text>
            <Text style={[styles.td, { color: COLOR.textSecondary }]}>
              {segment.value.toLocaleString('en-GB')} · {Math.round(segment.share * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
