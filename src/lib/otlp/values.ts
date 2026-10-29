/*
 * Reading OTLP values safely. The same code reads protobuf (decoded with protobufjs into the OTLP
 * JSON shape) and OTLP/JSON, so it accepts both encodings of each field: 64-bit integers as
 * strings or numbers, trace and span IDs as hex (OTLP/JSON) or base64 (protobuf bytes).
 *
 * Nothing that arrives is trusted: every count, key and value is capped here.
 */

export const LIMITS = {
  /** Attributes read from one resource, scope, point or span; the rest are dropped. */
  attributesPerItem: 64,
  keyLength: 128,
  /** String attribute values kept on spans (JSON copy). */
  spanValueLength: 1024,
  /** Values of the attributes kept on metric series. */
  seriesValueLength: 200,
  metricNameLength: 150,
  spanNameLength: 200,
  /** Elements read from an array or key-value list value. */
  nestedItems: 16,
  nestingDepth: 3,
} as const;

export type AttrValue = string | number | boolean | null | AttrValue[] | { [key: string]: AttrValue };
export type Attributes = Record<string, AttrValue>;

/** A short string, or undefined when the value isn't usable text. */
export function cap(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

/** An OTLP 64-bit integer (string, number or protobufjs Long) as a JS number. */
export function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof value === 'object' && 'low' in value && 'high' in value) {
    const { low, high, unsigned } = value as { low: number; high: number; unsigned?: boolean };
    return (unsigned ? high >>> 0 : high) * 2 ** 32 + (low >>> 0);
  }
  return 0;
}

/** Unix nanoseconds as a BigInt (exact), 0n when missing or malformed. */
export function toNanos(value: unknown): bigint {
  try {
    if (typeof value === 'string' && /^\d{1,20}$/.test(value)) return BigInt(value);
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return BigInt(Math.floor(value));
    }
    if (typeof value === 'bigint') return value;
  } catch {
    // fall through
  }
  const n = toNumber(value);
  return n > 0 ? BigInt(Math.floor(n)) : 0n;
}

/** Unix nanoseconds to epoch milliseconds (fractional). */
export function nanosToMs(nanos: bigint): number {
  return Number(nanos / 1000n) / 1000;
}

const HEX = /^[0-9a-f]+$/i;

/**
 * A trace or span ID as lowercase hex. OTLP/JSON sends hex; protobuf bytes arrive base64-encoded
 * from protobufjs. All zeros (or the wrong length) means "no ID".
 */
export function toHexId(value: unknown, bytes: 8 | 16): string | null {
  if (typeof value !== 'string' || !value) return null;

  let hex: string | null = null;

  if (value.length === bytes * 2 && HEX.test(value)) {
    hex = value.toLowerCase();
  } else {
    const buffer = Buffer.from(value, 'base64');
    if (buffer.length === bytes) hex = buffer.toString('hex');
  }

  return hex && /[^0]/.test(hex) ? hex : null;
}

/** An OTLP AnyValue as a plain JSON value, bounded in size and depth. */
export function anyValue(value: any, maxString: number, depth = 0): AttrValue {
  if (!value || typeof value !== 'object') return null;

  if (typeof value.stringValue === 'string') return cap(value.stringValue, maxString) ?? null;
  if (typeof value.boolValue === 'boolean') return value.boolValue;
  if (value.intValue !== undefined && value.intValue !== null) {
    const n = toNumber(value.intValue);
    return Number.isSafeInteger(n) ? n : String(value.intValue).slice(0, 25);
  }
  if (value.doubleValue !== undefined && value.doubleValue !== null) {
    const n = Number(value.doubleValue);
    return Number.isFinite(n) ? n : null;
  }
  if (depth >= LIMITS.nestingDepth) return null;
  if (value.arrayValue) {
    const values = Array.isArray(value.arrayValue.values) ? value.arrayValue.values : [];
    return values.slice(0, LIMITS.nestedItems).map((v: any) => anyValue(v, maxString, depth + 1));
  }
  if (value.kvlistValue) {
    return readAttributes(value.kvlistValue.values, maxString, LIMITS.nestedItems, depth + 1);
  }
  if (value.bytesValue) return '[bytes]';
  return null;
}

/** OTLP KeyValue[] as an object: at most `maxCount` keys, keys and string values capped. */
export function readAttributes(
  list: unknown,
  maxString: number = LIMITS.spanValueLength,
  maxCount: number = LIMITS.attributesPerItem,
  depth = 0,
): Attributes {
  const out: Attributes = Object.create(null);
  if (!Array.isArray(list)) return out;

  let kept = 0;
  for (const item of list) {
    if (kept >= maxCount) break;
    const key = cap(item?.key, LIMITS.keyLength);
    if (!key || key in out) continue;
    out[key] = anyValue(item.value, maxString, depth);
    kept += 1;
  }

  return out;
}

/** An attribute as a string (numbers and booleans too), or undefined. */
export function attrString(attrs: Attributes, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = attrs[key];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return undefined;
}

/** An attribute as an integer, or undefined. */
export function attrInt(attrs: Attributes, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const n = Number(attrs[key]);
    if (attrs[key] !== undefined && attrs[key] !== null && Number.isInteger(n)) return n;
  }
  return undefined;
}

/** Canonical JSON (sorted keys), so equal attribute sets hash the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson((value as any)[k])}`).join(',')}}`;
}
