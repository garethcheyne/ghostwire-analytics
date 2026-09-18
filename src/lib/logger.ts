/*
 * Structured logs: one JSON object per line on stdout (docker logs) and, with LOG_DIR set, in
 * daily files there (app-YYYY-MM-DD.log, kept LOG_RETENTION_DAYS, default 14), so they survive
 * the container being recreated. LOG_LEVEL: debug | info (default) | warn | error.
 * Server-side only. Never throws: logging must not break a request.
 */
import fs from 'node:fs';
import path from 'node:path';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const DAY_MS = 24 * 60 * 60 * 1000;

function minLevel(): number {
  const level = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
  return LEVELS[level] ?? LEVELS.info;
}

/** Errors become { name, message, stack }; everything else is kept as is. */
function serialize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack?.split('\n').slice(0, 15).join('\n'),
      ...('digest' in value && { digest: (value as any).digest }),
      ...('code' in value && { code: (value as any).code }),
    };
  }
  return value;
}

let stream: fs.WriteStream | null = null;
let streamDay = '';
let lastCleanup = 0;

function fileStream(now: Date) {
  const dir = process.env.LOG_DIR;
  if (!dir) return null;

  const day = now.toISOString().slice(0, 10);
  if (stream && streamDay === day) return stream;

  try {
    fs.mkdirSync(dir, { recursive: true });
    stream?.end();
    stream = fs.createWriteStream(path.join(dir, `app-${day}.log`), { flags: 'a' });
    stream.on('error', () => {
      stream = null;
    });
    streamDay = day;
    cleanup(dir, now);
    return stream;
  } catch {
    return null;
  }
}

/** Deletes log files older than LOG_RETENTION_DAYS (checked at most once an hour). */
function cleanup(dir: string, now: Date) {
  if (now.getTime() - lastCleanup < 60 * 60 * 1000) return;
  lastCleanup = now.getTime();

  const days = Number(process.env.LOG_RETENTION_DAYS ?? 14);
  if (!Number.isFinite(days) || days <= 0) return;
  const cutoff = new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);

  fs.readdir(dir, (error, files) => {
    if (error) return;
    for (const file of files) {
      const match = /^app-(\d{4}-\d{2}-\d{2})\.log$/.exec(file);
      if (match && match[1] < cutoff) fs.unlink(path.join(dir, file), () => {});
    }
  });
}

function write(level: Level, event: string, fields?: Record<string, unknown>) {
  try {
    if (LEVELS[level] < minLevel()) return;

    const now = new Date();
    const entry: Record<string, unknown> = { time: now.toISOString(), level, event };
    for (const [key, value] of Object.entries(fields ?? {})) {
      if (value !== undefined) entry[key] = serialize(value);
    }
    const line = JSON.stringify(entry);

    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
    fileStream(now)?.write(`${line}\n`);
  } catch {
    /* never let logging break the caller */
  }
}

export const log = {
  debug: (event: string, fields?: Record<string, unknown>) => write('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields),
};
