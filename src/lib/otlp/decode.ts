/*
 * OTLP/HTTP request bodies: protobuf (application/x-protobuf) or JSON (application/json), optionally
 * gzip or deflate encoded. Protobuf is decoded with protobufjs against the official
 * opentelemetry-proto definitions (src/lib/otlp/otlp-proto.json, built by
 * scripts/build-otlp-proto.mjs) into the same shape as OTLP/JSON, so one reader handles both.
 */
import protobuf from 'protobufjs';
import { gunzipSync, inflateSync } from 'node:zlib';
import descriptor from './otlp-proto.json';

export type OtlpSignal = 'metrics' | 'traces';
export type OtlpEncoding = 'protobuf' | 'json';

/** Largest body accepted on the wire (compressed), and once decompressed. */
export const MAX_BODY_BYTES = 10 * 1024 * 1024;
export const MAX_DECOMPRESSED_BYTES = 40 * 1024 * 1024;

export class OtlpRequestError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

let root: protobuf.Root | null = null;

function types() {
  root ??= protobuf.Root.fromJSON(descriptor as protobuf.INamespace);

  return {
    metrics: root.lookupType('opentelemetry.proto.collector.metrics.v1.ExportMetricsServiceRequest'),
    traces: root.lookupType('opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest'),
    metricsResponse: root.lookupType(
      'opentelemetry.proto.collector.metrics.v1.ExportMetricsServiceResponse',
    ),
    tracesResponse: root.lookupType('opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse'),
  };
}

/** Which encoding a Content-Type names, or null for anything else. */
export function encodingOf(contentType: string | null): OtlpEncoding | null {
  const type = contentType?.split(';')[0].trim().toLowerCase();

  if (type === 'application/x-protobuf' || type === 'application/protobuf') return 'protobuf';
  if (type === 'application/json') return 'json';
  return null;
}

/** Undoes Content-Encoding (gzip, deflate or none), never producing more than the limit. */
export function decompress(body: Uint8Array, contentEncoding: string | null): Uint8Array {
  const encoding = contentEncoding?.trim().toLowerCase() || 'identity';

  try {
    if (encoding === 'gzip' || encoding === 'x-gzip') {
      return gunzipSync(body, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
    }
    if (encoding === 'deflate') {
      return inflateSync(body, { maxOutputLength: MAX_DECOMPRESSED_BYTES });
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ERR_BUFFER_TOO_LARGE') {
      throw new OtlpRequestError('Body too large once decompressed.', 413);
    }
    throw new OtlpRequestError(`Body is not valid ${encoding}.`);
  }

  if (encoding !== 'identity') {
    throw new OtlpRequestError(`Unsupported Content-Encoding: ${encoding.slice(0, 20)}`, 415);
  }

  return body;
}

/**
 * Decodes an export request into the OTLP/JSON shape (camelCase fields, 64-bit integers as
 * strings, enums as numbers, bytes as base64), or throws OtlpRequestError.
 */
export function decodeRequest(signal: OtlpSignal, encoding: OtlpEncoding, body: Uint8Array): any {
  if (encoding === 'json') {
    try {
      const parsed = JSON.parse(Buffer.from(body).toString('utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      return parsed;
    } catch {
      throw new OtlpRequestError('Body is not a valid OTLP/JSON export request.');
    }
  }

  const type = types()[signal];

  try {
    const message = type.decode(body);
    return type.toObject(message, {
      longs: String,
      enums: Number,
      bytes: String,
      defaults: false,
      arrays: false,
    });
  } catch {
    throw new OtlpRequestError('Body is not a valid OTLP protobuf export request.');
  }
}

/**
 * The OTLP success response: ExportMetricsServiceResponse / ExportTraceServiceResponse, with a
 * partial_success when something was rejected, in the request's encoding.
 */
export function encodeResponse(
  signal: OtlpSignal,
  encoding: OtlpEncoding,
  rejected: number,
  message?: string,
): { body: Uint8Array | string; contentType: string } {
  const field = signal === 'metrics' ? 'rejectedDataPoints' : 'rejectedSpans';
  const value =
    rejected > 0 || message
      ? { partialSuccess: { [field]: String(rejected), errorMessage: message ?? '' } }
      : {};

  if (encoding === 'json') {
    return { body: JSON.stringify(value), contentType: 'application/json' };
  }

  const type = types()[signal === 'metrics' ? 'metricsResponse' : 'tracesResponse'];
  return { body: type.encode(type.fromObject(value)).finish(), contentType: 'application/x-protobuf' };
}

/** gRPC status codes used in error bodies. */
export const RPC_CODE = {
  invalidArgument: 3,
  permissionDenied: 7,
  resourceExhausted: 8,
  unauthenticated: 16,
  internal: 13,
} as const;

/**
 * The google.rpc.Status body OTLP/HTTP sends with 4xx/5xx answers, in the request's encoding
 * (`code` field 1, `message` field 2; written by hand since Status isn't in the OTLP protos).
 */
export function errorBody(
  encoding: OtlpEncoding | null,
  code: number,
  message: string,
): { body: Uint8Array | string; contentType: string } {
  if (encoding === 'protobuf') {
    const body = protobuf.Writer.create().uint32(8).int32(code).uint32(18).string(message).finish();
    return { body, contentType: 'application/x-protobuf' };
  }

  return { body: JSON.stringify({ code, message }), contentType: 'application/json' };
}
