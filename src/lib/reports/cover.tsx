/*
 * The report cover.
 *
 * Carries the sign-in screen's terminal treatment (src/app/login/layout.tsx)
 * — dot grid, corner glows, mono type and a command panel — so the first page
 * of a report is recognisably the same product. What the sign-in screen fills
 * with a demo, this fills with the report's own figures.
 *
 * Kept apart from template.tsx because it is a whole page design rather than a
 * building block, and because the import runs one way: the cover uses the
 * template's furniture, never the other way round.
 */
import {
  Circle,
  Defs,
  Image,
  LinearGradient,
  Page,
  RadialGradient,
  Rect,
  Stop,
  StyleSheet,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer';
import { ghostwireLogo } from './brand';
import { GradientRule, type ReportMeta } from './template';
import { COLOR, FONT, PAGE, SIZE, SPACE, TERMINAL } from './theme';

/** A line of terminal output: `$ <command> <target>   <status>`. */
export interface TerminalLine {
  command: string;
  target: string;
  status: string;
  /** One of TERMINAL's status colours. Defaults to the "ok" green. */
  tone?: string;
}

/** A cell in the cover's stat strip. */
export interface CoverStat {
  value: string;
  label: string;
  tone?: string;
}

const HAIRLINE = 'rgba(255,255,255,0.07)';
const PANEL = 'rgba(255,255,255,0.02)';

const styles = StyleSheet.create({
  page: {
    fontFamily: FONT.family,
    color: COLOR.text,
    backgroundColor: TERMINAL.page,
    padding: 0,
  },
  body: {
    padding: PAGE.margin + 8,
    height: PAGE.height,
    flexDirection: 'column',
  },
  wordmark: {
    fontFamily: FONT.bold,
    fontSize: SIZE.section,
    color: COLOR.text,
    letterSpacing: 3,
  },
  online: {
    fontFamily: FONT.mono,
    fontSize: SIZE.tiny,
    color: TERMINAL.ok,
    letterSpacing: 1.5,
  },
  eyebrow: {
    fontFamily: FONT.mono,
    fontSize: SIZE.tiny,
    color: TERMINAL.prompt,
    letterSpacing: 2.5,
  },
  siteName: {
    fontFamily: FONT.bold,
    fontSize: SIZE.cover,
    color: COLOR.text,
    lineHeight: 1.1,
  },
  period: { fontFamily: FONT.mono, fontSize: SIZE.body, color: COLOR.textSecondary },
  summary: {
    fontFamily: FONT.mono,
    fontSize: SIZE.small,
    color: 'rgba(255,255,255,0.4)',
    marginTop: SPACE.md,
    maxWidth: 400,
    lineHeight: 1.6,
  },
  terminal: {
    borderWidth: 1,
    borderColor: HAIRLINE,
    borderRadius: 6,
    backgroundColor: PANEL,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  titleBarLabel: {
    fontFamily: FONT.mono,
    fontSize: SIZE.tiny,
    color: 'rgba(255,255,255,0.28)',
    letterSpacing: 1,
    marginLeft: SPACE.sm,
  },
  mono: { fontFamily: FONT.mono, fontSize: SIZE.small },
  footNote: {
    fontFamily: FONT.mono,
    fontSize: SIZE.tiny,
    color: 'rgba(255,255,255,0.18)',
    letterSpacing: 2,
  },
});

/** The faint teal dot grid behind everything, as on the sign-in panel. */
function DotGrid() {
  const step = TERMINAL.gridSpacing;
  const columns = Math.ceil(PAGE.width / step);
  const rows = Math.ceil(PAGE.height / step);

  return (
    // One pixel short of the page: an Svg exactly as tall as the page cannot
    // fit alongside anything else and is pushed onto a blank page of its own.
    <Svg
      width={PAGE.width}
      height={PAGE.height - 1}
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: columns }, (_, column) => (
          <Circle
            key={`${row}-${column}`}
            cx={column * step + step / 2}
            cy={row * step + step / 2}
            r={0.9}
            fill={TERMINAL.grid}
            fillOpacity={TERMINAL.gridOpacity}
          />
        )),
      )}
    </Svg>
  );
}

/** Cyan top-left, violet bottom-right, with hairlines along both edges. */
function CornerGlows() {
  const size = 360;

  return (
    <Svg
      width={PAGE.width}
      height={PAGE.height - 1}
      style={{ position: 'absolute', top: 0, left: 0 }}
    >
      <Defs>
        <RadialGradient id="glow-cyan" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={TERMINAL.glowCyan} stopOpacity={0.24} />
          <Stop offset="1" stopColor={TERMINAL.glowCyan} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="glow-violet" cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={TERMINAL.glowViolet} stopOpacity={0.22} />
          <Stop offset="1" stopColor={TERMINAL.glowViolet} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="edge-cyan" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={TERMINAL.glowCyan} stopOpacity={0} />
          <Stop offset="0.5" stopColor={TERMINAL.glowCyan} stopOpacity={0.55} />
          <Stop offset="1" stopColor={TERMINAL.glowCyan} stopOpacity={0} />
        </LinearGradient>
        <LinearGradient id="edge-violet" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={TERMINAL.glowViolet} stopOpacity={0} />
          <Stop offset="0.5" stopColor={TERMINAL.glowViolet} stopOpacity={0.45} />
          <Stop offset="1" stopColor={TERMINAL.glowViolet} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      <Rect x={-size / 3} y={-size / 3} width={size} height={size} fill="url(#glow-cyan)" />
      <Rect
        x={PAGE.width - size * 0.66}
        y={PAGE.height - size * 0.7}
        width={size}
        height={size}
        fill="url(#glow-violet)"
      />
      <Rect x={0} y={0} width={PAGE.width} height={1} fill="url(#edge-cyan)" />
      <Rect x={0} y={PAGE.height - 3} width={PAGE.width} height={1} fill="url(#edge-violet)" />
    </Svg>
  );
}

/** The report's headline figures, as terminal output. */
function TerminalPanel({ lines, label }: { lines: TerminalLine[]; label: string }) {
  return (
    <View style={styles.terminal}>
      <View style={styles.titleBar}>
        <Svg width={30} height={7}>
          <Circle cx={3.5} cy={3.5} r={3.5} fill="#ef4444" fillOpacity={0.6} />
          <Circle cx={14} cy={3.5} r={3.5} fill="#eab308" fillOpacity={0.6} />
          <Circle cx={24.5} cy={3.5} r={3.5} fill="#22c55e" fillOpacity={0.6} />
        </Svg>
        <Text style={styles.titleBarLabel}>{label}</Text>
      </View>

      <View style={{ paddingHorizontal: SPACE.md, paddingVertical: SPACE.md, gap: 6 }}>
        {lines.map(line => (
          <View
            key={line.target}
            style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}
          >
            <Text style={[styles.mono, { color: 'rgba(255,255,255,0.22)' }]}>$</Text>
            <Text style={[styles.mono, { color: TERMINAL.prompt, width: 56 }]}>{line.command}</Text>
            <Text
              style={[
                styles.mono,
                { color: 'rgba(255,255,255,0.45)', flexGrow: 1, flexBasis: 0 },
              ]}
            >
              {line.target}
            </Text>
            <Text style={[styles.mono, { color: line.tone ?? TERMINAL.ok, textAlign: 'right' }]}>
              {line.status}
            </Text>
          </View>
        ))}

        {/*
          The blinking prompt from the sign-in screen, at rest. Written with
          characters Courier actually carries: the sign-in screen's triangle
          is outside the font's encoding and drops out to a stray dot.
        */}
        <Text
          style={[
            styles.mono,
            { color: 'rgba(255,255,255,0.22)', fontSize: SIZE.tiny, paddingTop: 2 },
          ]}
        >
          &gt; _
        </Text>
      </View>
    </View>
  );
}

/** The stat strip under the terminal: three figures in mono, as on sign-in. */
function StatStrip({ stats }: { stats: CoverStat[] }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 6,
      }}
    >
      {stats.map((stat, index) => (
        <View
          key={stat.label}
          style={{
            flexGrow: 1,
            flexBasis: 0,
            alignItems: 'center',
            paddingVertical: SPACE.md,
            backgroundColor: PANEL,
            borderRightWidth: index < stats.length - 1 ? 1 : 0,
            borderRightColor: HAIRLINE,
          }}
        >
          <Text
            style={{
              fontFamily: FONT.monoBold,
              fontSize: SIZE.title,
              color: stat.tone ?? TERMINAL.prompt,
            }}
          >
            {stat.value}
          </Text>
          <Text
            style={{
              fontFamily: FONT.mono,
              fontSize: SIZE.tiny,
              color: 'rgba(255,255,255,0.3)',
              letterSpacing: 1.5,
              marginTop: 3,
            }}
          >
            {stat.label.toUpperCase()}
          </Text>
        </View>
      ))}
    </View>
  );
}

const formatDate = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function CoverPage({
  meta,
  summary,
  terminal = [],
  stats = [],
}: {
  meta: ReportMeta;
  summary?: string;
  terminal?: TerminalLine[];
  stats?: CoverStat[];
}) {
  const logo = ghostwireLogo();

  return (
    <Page size="A4" style={styles.page}>
      <DotGrid />
      <CornerGlows />

      <View style={styles.body}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image is a PDF drawing primitive, not an <img>; it takes no alt prop. */}
          {logo ? <Image src={logo} style={{ width: 30, height: 30 }} /> : null}
          <View>
            <Text style={styles.wordmark}>GHOSTWIRE</Text>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.xs, marginTop: 2 }}
            >
              <Svg width={4} height={4}>
                <Circle cx={2} cy={2} r={2} fill={TERMINAL.ok} />
              </Svg>
              <Text style={styles.online}>ANALYTICS ONLINE</Text>
            </View>
          </View>
        </View>

        <View style={{ marginTop: 'auto' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.sm,
              marginBottom: SPACE.md,
            }}
          >
            <Svg width={22} height={1}>
              <Rect x={0} y={0} width={22} height={1} fill={TERMINAL.prompt} fillOpacity={0.6} />
            </Svg>
            <Text style={styles.eyebrow}>{meta.title.toUpperCase()}</Text>
          </View>

          <Text style={styles.siteName}>{meta.siteName}</Text>

          <View style={{ marginTop: SPACE.md, marginBottom: SPACE.md }}>
            <GradientRule width={120} height={3} />
          </View>

          <Text style={styles.period}>{meta.period}</Text>
          {summary ? <Text style={styles.summary}>{summary}</Text> : null}
        </View>

        {terminal.length ? (
          <View style={{ marginTop: SPACE.xl }}>
            <TerminalPanel lines={terminal} label="ghostwire-analytics &#8212; report" />
          </View>
        ) : null}

        {stats.length ? (
          <View style={{ marginTop: SPACE.sm }}>
            <StatStrip stats={stats} />
          </View>
        ) : null}

        <View
          style={{ marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between' }}
        >
          <Text style={styles.footNote}>{'// COLLECT. ANALYSE. RESPECT.'}</Text>
          <Text style={[styles.footNote, { letterSpacing: 0 }]}>
            {formatDate(meta.generatedAt)}
          </Text>
        </View>
      </View>
    </Page>
  );
}
