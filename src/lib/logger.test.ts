import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from './logger';
import { count, takeCounters } from './metrics';

let dir: string;
let stdout: ReturnType<typeof vi.spyOn>;
let stderr: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw-logs-'));
  stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdout.mockRestore();
  stderr.mockRestore();
  delete process.env.LOG_DIR;
  delete process.env.LOG_LEVEL;
});

const lines = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map(([chunk]) => JSON.parse(String(chunk)));

describe('logger', () => {
  it('writes one JSON line per entry, errors to stderr with their stack', () => {
    log.info('stats', { counters: { 'send.accepted.event': 3 } });
    log.error('api.server_error', { error: new TypeError('boom'), path: '/api/x' });

    expect(lines(stdout)[0]).toMatchObject({
      level: 'info',
      event: 'stats',
      counters: { 'send.accepted.event': 3 },
    });
    const [entry] = lines(stderr);
    expect(entry).toMatchObject({ level: 'error', event: 'api.server_error', path: '/api/x' });
    expect(entry.error).toMatchObject({ name: 'TypeError', message: 'boom' });
    expect(entry.error.stack).toContain('TypeError: boom');
    expect(Date.parse(entry.time)).not.toBeNaN();
  });

  it('skips entries below LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'warn';
    log.info('quiet');
    log.debug('quieter');
    log.warn('loud');

    expect(stdout).not.toHaveBeenCalled();
    expect(lines(stderr).map(entry => entry.event)).toEqual(['loud']);
  });

  it('also appends to a daily file in LOG_DIR', async () => {
    process.env.LOG_DIR = dir;
    log.info('app.start', { version: '0.1.0' });

    const file = path.join(dir, `app-${new Date().toISOString().slice(0, 10)}.log`);
    await vi.waitFor(() => expect(fs.readFileSync(file, 'utf8')).toContain('"event":"app.start"'));
  });
});

describe('traffic counters', () => {
  it('adds up and resets after each report', () => {
    count('send.accepted.event');
    count('send.accepted.event');
    count('send.dropped.bot', 5);

    expect(takeCounters().counters).toEqual({
      'send.accepted.event': 2,
      'send.dropped.bot': 5,
    });
    expect(takeCounters().counters).toEqual({});
  });
});
