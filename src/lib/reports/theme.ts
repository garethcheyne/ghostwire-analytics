/*
 * Design tokens for generated PDF reports — dark, Ghostwire-branded.
 *
 * Separate from the app's CSS tokens on purpose: a PDF has no cascade, no
 * media queries and no viewport, so these are absolute values in points
 * (1/72"), sized for A4. The values themselves are taken from the app's dark
 * theme in globals.css so the two stay recognisably the same product.
 *
 * Every report in the range draws from this file, so a change here moves the
 * whole set together.
 */

/** A4 in points, and the frame the content sits in. */
export const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 40,
  headerHeight: 62,
  footerHeight: 40,
};

/** Usable width inside the margins — the width every table and chart fits to. */
export const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

/**
 * Ink and surfaces, from the app's `.dark` tokens.
 *
 * A dark document is a deliberate choice: these reports are read on screen,
 * and it makes them look like the product they came from. The page is the
 * near-black `background` rather than true black and the body text is
 * `foreground` rather than pure white because maximum contrast glares and
 * smears on a backlit screen — the same reason the app itself avoids both.
 */
export const COLOR = {
  /** hsl(222.2 84% 4.9%) — the app's dark `--background`. */
  page: '#020817',
  /** hsl(222.2 47.4% 11.2%) — the app's `--sidebar`, for lifted cards. */
  card: '#0f172a',
  /** hsl(217.2 32.6% 17.5%) — the app's `--muted`/`--border`. */
  raised: '#1e293b',
  border: '#1e293b',
  borderStrong: '#334155',

  /** hsl(210 40% 98%) — `--foreground`. */
  text: '#f8fafc',
  /** hsl(215 20.2% 65.1%) — `--muted-foreground`. */
  textSecondary: '#94a3b8',
  textMuted: '#64748b',

  /** hsl(199 89% 48%) — the app's `--primary`. Accents and UI furniture. */
  brand: '#0ea5e9',
  /** The suite's cyan→purple gradient (cyan-400 → purple-400). Decoration only. */
  gradientFrom: '#22d3ee',
  gradientTo: '#c084fc',

  /**
   * Categorical series, in fixed order — never cycled, never generated.
   *
   * Validated as a pair against the card surface in dark mode: both inside the
   * L 0.48–0.67 band, CVD ΔE 13.9 (protan) and normal-vision ΔE 24.0, both
   * clearing 3:1 contrast. The brighter sky (#0ea5e9) and the gradient's cyan
   * both sit outside the dark lightness band, so they are used for decoration
   * and never to encode a series. Adding a third slot means re-validating the
   * set, not picking a hue that looks right.
   */
  series: ['#0369a1', '#a855f7'] as const,

  /**
   * Segment colours for part-to-whole, in fixed order. Six slots is the
   * ceiling: past that, adjacent segments blur and the tail folds into
   * "Other". Validated as a set of six against the card surface in dark mode —
   * all inside the L band, worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3,
   * all clearing 3:1.
   */
  segments: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'] as const,

  /**
   * A sequential ramp, light use → heavy use, for the activity grid.
   * Validated as an ordinal ramp on the dark card: one hue (12° spread),
   * monotone lightness, every adjacent gap ≥ 0.06 L, and the dimmest step at
   * 3.01:1 against the surface so a quiet hour is still visible.
   */
  ramp: ['#0369a1', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd'] as const,

  /**
   * Two steps of one hue, for a split with only two parts.
   *
   * Deliberately not taken from `segments`: a two-part split often sits
   * beside a categorical chart, and reusing its first two hues invites the
   * reader to match the bar to a slice that has nothing to do with it. Two
   * shades of a single hue read as one measure divided, which is what this
   * is. Validated as an ordinal pair on the card: one hue (10° spread),
   * ΔL 0.20, dimmer step at 3.01:1 against the surface.
   */
  shades: ['#38bdf8', '#0369a1'] as const,

  /** Reserved for state, never for a series. */
  positive: '#4ade80',
  negative: '#fb7185',
};

/**
 * The cover's terminal treatment, lifted from the sign-in screen
 * (src/app/login/layout.tsx) so the first page of a report looks like the
 * product it came from.
 *
 * These are decoration and chrome — a status pip, a glow, a dot grid. None of
 * them encodes a value, so they are not bound by the series palettes.
 */
export const TERMINAL = {
  /** Deeper than the app's page black, as on the sign-in panel. */
  page: '#050a0f',
  /** The faint teal dot grid. */
  grid: '#00dcb4',
  gridOpacity: 0.1,
  gridSpacing: 28,
  /** Corner glows: cyan top-left, violet bottom-right. */
  glowCyan: '#22d3ee',
  glowViolet: '#8b5cf6',
  /** Terminal chrome and text. */
  chrome: '#ffffff',
  prompt: '#22d3ee',
  dim: '#64748b',
  ok: '#4ade80',
  warn: '#facc15',
  info: '#22d3ee',
  violet: '#a78bfa',
};

/**
 * Type. All four are PDF built-ins, so nothing is fetched and the report
 * renders identically offline and in a container with no network.
 *
 * The mono faces carry the terminal treatment on the cover, matching the
 * sign-in screen.
 */
export const FONT = {
  family: 'Helvetica',
  bold: 'Helvetica-Bold',
  mono: 'Courier',
  monoBold: 'Courier-Bold',
};

export const SIZE = {
  cover: 40,
  hero: 22,
  title: 17,
  section: 12,
  body: 9,
  small: 8,
  tiny: 7,
};

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
};
