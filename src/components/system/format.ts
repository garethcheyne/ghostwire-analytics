/** Display formats for the System pages. Missing values show as an en dash. */

const DASH = '–';

export function formatMs(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  if (value >= 60_000) return `${(value / 60_000).toFixed(1)} min`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 2)} s`;
  if (value >= 10) return `${Math.round(value)} ms`;
  return `${value.toFixed(value >= 1 ? 1 : 2)} ms`;
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  return `${value.toFixed(value !== 0 && Math.abs(value) < 1 ? Math.max(digits, 2) : digits)}%`;
}

/** A ratio (0-1) as a percentage. */
export function formatRatio(value: number | null | undefined) {
  return value === null || value === undefined ? DASH : formatPercent(value * 100);
}

export function formatBytes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = value;
  let i = 0;
  while (Math.abs(n) >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatRate(perMinute: number | null | undefined) {
  if (perMinute === null || perMinute === undefined || !Number.isFinite(perMinute)) return DASH;
  if (perMinute >= 100) return `${Math.round(perMinute).toLocaleString()}/min`;
  if (perMinute >= 1) return `${perMinute.toFixed(1)}/min`;
  return `${(perMinute * 60).toFixed(perMinute * 60 >= 10 ? 0 : 1)}/h`;
}

export function formatCount(value: number | null | undefined) {
  return value === null || value === undefined ? DASH : Math.round(value).toLocaleString();
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return DASH;
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/** A chart tick for a bucket start, by bucket size. */
export function formatBucket(t: number, bucketSeconds: number) {
  const date = new Date(t);
  if (bucketSeconds >= 86400) return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  if (bucketSeconds >= 3600) {
    return date.toLocaleString('en-US', { day: 'numeric', month: 'short', hour: 'numeric' });
  }
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export const SPAN_KINDS = ['Unspecified', 'Internal', 'Server', 'Client', 'Producer', 'Consumer'];
