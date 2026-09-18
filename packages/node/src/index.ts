/*
 * Server-side error reporting for Ghostwire Analytics.
 *
 * Everything here only observes. It never catches, swallows or rethrows your errors, never
 * changes whether the process exits, and never throws or rejects itself.
 */
import { spawnSync } from 'node:child_process';

export interface GhostwireOptions {
  /** Your Ghostwire Analytics server, e.g. https://analytics.example.com */
  host: string;
  /** The website's ID, from its settings in Ghostwire. */
  websiteId: string;
  /** The website's error ingest key (keep it secret, e.g. in GHOSTWIRE_ERROR_KEY). */
  key: string;
  /** e.g. "production". */
  environment?: string;
  /** e.g. your app version or commit, to see which release an error started in. */
  release?: string;
  /**
   * Report crashes (uncaught exceptions and unhandled rejections). Uses Node's
   * uncaughtExceptionMonitor, so the process still exits exactly as it would have. Default true.
   */
  captureUncaught?: boolean;
  /** Give up on a report after this long. Default 3000 ms. */
  timeoutMs?: number;
  /** Change or drop (return null) a report before it's sent. */
  beforeSend?: (report: ErrorReport) => ErrorReport | null;
  /** Log reporting problems to the console. Default false. */
  debug?: boolean;
}

export interface GhostwireUser {
  id: string;
  email?: string;
  name?: string;
}

/**
 * The request being handled when the error happened. Accepts Express/Node requests, Fetch API
 * requests, Next.js onRequestError requests, or a plain { method, url, userAgent }.
 */
export type RequestLike =
  | { method?: string; url?: string; userAgent?: string }
  | { method?: string; originalUrl?: string; url?: string; headers?: Record<string, unknown> }
  | { method?: string; url?: string; headers?: { get(name: string): string | null } }
  | { method?: string; path?: string; headers?: Record<string, unknown> };

export interface CaptureContext {
  user?: GhostwireUser;
  request?: RequestLike;
  /** Short key/value labels, e.g. { feature: 'checkout' }. */
  tags?: Record<string, string>;
  /** Anything else useful for debugging. */
  extra?: Record<string, unknown>;
  /** false for crashes; true (the default) for errors you caught and reported. */
  handled?: boolean;
}

export interface ErrorReport {
  website: string;
  platform: 'node';
  error: { type: string; message: string; stack?: string };
  handled: boolean;
  user?: GhostwireUser;
  request?: { method?: string; url?: string; userAgent?: string };
  environment?: string;
  release?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  timestamp: number;
}

type Config = GhostwireOptions & { timeoutMs: number };

let config: Config | null = null;
let monitorInstalled = false;

/** Settings from GHOSTWIRE_HOST, GHOSTWIRE_WEBSITE_ID and GHOSTWIRE_ERROR_KEY, when init() wasn't called. */
function configFromEnv(): Config | null {
  const { GHOSTWIRE_HOST, GHOSTWIRE_WEBSITE_ID, GHOSTWIRE_ERROR_KEY } = process.env;
  if (!GHOSTWIRE_HOST || !GHOSTWIRE_WEBSITE_ID || !GHOSTWIRE_ERROR_KEY) return null;

  return {
    host: GHOSTWIRE_HOST,
    websiteId: GHOSTWIRE_WEBSITE_ID,
    key: GHOSTWIRE_ERROR_KEY,
    environment: process.env.GHOSTWIRE_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.GHOSTWIRE_RELEASE,
    timeoutMs: 3000,
  };
}

function getConfig() {
  return config ?? configFromEnv();
}

function log(message: string, detail?: unknown) {
  if (getConfig()?.debug) console.warn(`[ghostwire] ${message}`, detail ?? '');
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === 'string') return new Error(value);

  try {
    return new Error(JSON.stringify(value) ?? String(value));
  } catch {
    return new Error(String(value)); // circular or otherwise unserializable
  }
}

function header(headers: unknown, name: string): string | undefined {
  if (!headers) return undefined;

  if (typeof (headers as { get?: unknown }).get === 'function') {
    return (headers as { get(name: string): string | null }).get(name) ?? undefined;
  }

  const value = (headers as Record<string, unknown>)[name];
  return Array.isArray(value) ? String(value[0]) : typeof value === 'string' ? value : undefined;
}

/** Method, path (without the query string, which can hold tokens) and user agent. */
export function normalizeRequest(request: RequestLike | undefined) {
  if (!request) return undefined;

  const req = request as Record<string, any>;
  const rawUrl: string | undefined = req.originalUrl ?? req.url ?? req.path;
  let url = rawUrl;

  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl, 'http://localhost');
      url = /^https?:\/\//i.test(rawUrl) ? `${parsed.origin}${parsed.pathname}` : parsed.pathname;
    } catch {
      url = rawUrl.split('?')[0];
    }
  }

  return {
    method: typeof req.method === 'string' ? req.method : undefined,
    url,
    userAgent: req.userAgent ?? header(req.headers, 'user-agent'),
  };
}

function buildReport(error: unknown, context: CaptureContext, cfg: Config): ErrorReport {
  const err = toError(error);

  return {
    website: cfg.websiteId,
    platform: 'node',
    error: {
      type: err.name || 'Error',
      message: err.message || String(err),
      stack: typeof err.stack === 'string' ? err.stack : undefined,
    },
    handled: context.handled ?? true,
    user: context.user,
    request: normalizeRequest(context.request),
    environment: cfg.environment,
    release: cfg.release,
    tags: context.tags,
    extra: context.extra,
    timestamp: Date.now(),
  };
}

function applyBeforeSend(report: ErrorReport, cfg: Config) {
  if (!cfg.beforeSend) return report;

  try {
    return cfg.beforeSend(report);
  } catch (e) {
    log('beforeSend threw; sending the report unchanged', e);
    return report;
  }
}

const endpoint = (cfg: Config) => `${cfg.host.replace(/\/+$/, '')}/api/errors`;

/**
 * Report an error. Resolves to the error group's ID, or undefined if it couldn't be sent.
 * Never throws or rejects, so it's safe to call anywhere (including catch blocks).
 */
export async function captureException(
  error: unknown,
  context: CaptureContext = {},
): Promise<string | undefined> {
  try {
    const cfg = getConfig();
    if (!cfg) {
      log(
        'not configured: call init() or set GHOSTWIRE_HOST, GHOSTWIRE_WEBSITE_ID and GHOSTWIRE_ERROR_KEY',
      );
      return undefined;
    }

    const report = applyBeforeSend(buildReport(error, context, cfg), cfg);
    if (!report) return undefined;

    const response = await fetch(endpoint(cfg), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });

    if (!response.ok) {
      log(`report rejected (${response.status})`, await response.text().catch(() => ''));
      return undefined;
    }

    const data = (await response.json().catch(() => null)) as { groupId?: string } | null;
    return data?.groupId;
  } catch (e) {
    log('could not send report', e);
    return undefined;
  }
}

/**
 * Called by Node just before it exits on a crash. The process won't wait for a promise, so
 * the report is sent from a short-lived child process, synchronously, within the timeout.
 */
function onUncaught(error: unknown, origin: string) {
  try {
    const cfg = getConfig();
    if (!cfg) return;

    const report = applyBeforeSend(
      buildReport(error, { handled: false, extra: { origin } }, cfg),
      cfg,
    );
    if (!report) return;

    sendSync(report, cfg);
  } catch {
    /* never interfere with the crash */
  }
}

const SEND_SCRIPT = `
const body = require('fs').readFileSync(0, 'utf8');
fetch(process.argv[1], {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.GHOSTWIRE_SEND_KEY },
  body,
  signal: AbortSignal.timeout(Number(process.env.GHOSTWIRE_SEND_TIMEOUT)),
}).catch(() => {});
`;

export function sendSync(report: ErrorReport, cfg: Config) {
  spawnSync(process.execPath, ['-e', SEND_SCRIPT, endpoint(cfg)], {
    input: JSON.stringify(report),
    // The key goes through the environment, not the command line (which other users can see).
    env: {
      ...process.env,
      GHOSTWIRE_SEND_KEY: cfg.key,
      GHOSTWIRE_SEND_TIMEOUT: String(cfg.timeoutMs),
    },
    timeout: cfg.timeoutMs + 500,
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true,
  });
}

/** Configure reporting. Call once at startup. */
export function init(options: GhostwireOptions) {
  config = { timeoutMs: 3000, ...options };

  if (options.captureUncaught !== false && !monitorInstalled) {
    // uncaughtExceptionMonitor observes crashes (including unhandled rejections) without
    // handling them. 'uncaughtException' / 'unhandledRejection' listeners would stop the crash.
    process.on('uncaughtExceptionMonitor', onUncaught);
    monitorInstalled = true;
  }
}

/**
 * Express error middleware: reports the error, then passes it on unchanged to your next error
 * handler (or Express's default). Add it after your routes.
 */
export function errorHandler() {
  return function ghostwireErrorHandler(
    error: unknown,
    request: RequestLike,
    _response: unknown,
    next: (error?: unknown) => void,
  ) {
    void captureException(error, { request, handled: false });
    next(error);
  };
}

/** Test helper: forget init(). */
export function reset() {
  config = null;
  if (monitorInstalled) {
    process.off('uncaughtExceptionMonitor', onUncaught);
    monitorInstalled = false;
  }
}

export {
  detectRelease,
  registerRelease,
  uploadSourceMaps,
  type ReleaseInput,
  type UploadInput,
} from './releases';
