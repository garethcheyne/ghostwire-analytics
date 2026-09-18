import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from './cli-main';
import { detectRelease, registerRelease, uploadSourceMaps } from './releases';

const server = { host: 'https://gw.example.com/', websiteId: 'w1', key: 'gwe_test' };
const fetchMock = vi.fn();
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'gw-maps-'));
  await mkdir(join(dir, 'chunks', 'app'), { recursive: true });
  await writeFile(join(dir, 'chunks', 'main-1a2b.js.map'), '{"version":3,"mappings":""}');
  await writeFile(join(dir, 'chunks', 'app', 'page-3c4d.js.map'), '{"version":3,"mappings":""}');
  await writeFile(join(dir, 'chunks', 'main-1a2b.js'), 'console.log(1)');

  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () => new Response(JSON.stringify({ saved: 2, failed: [] }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});

describe('uploadSourceMaps', () => {
  it('uploads every .js.map under the folder, named by URL path', async () => {
    const result = await uploadSourceMaps({
      ...server,
      release: '2.4.1',
      dir,
      urlPrefix: '/_next/static/',
    });

    expect(result).toEqual({ found: 2, saved: 2, failed: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gw.example.com/api/websites/w1/sourcemaps');
    expect(init.headers.authorization).toBe('Bearer gwe_test');

    const form = init.body as FormData;
    expect(form.get('release')).toBe('2.4.1');
    const names = (form.getAll('file') as File[]).map(file => file.name).sort();
    expect(names).toEqual([
      '/_next/static/chunks/app/page-3c4d.js.map',
      '/_next/static/chunks/main-1a2b.js.map',
    ]);
  });

  it('deletes the maps afterwards when asked, keeping the JavaScript', async () => {
    await uploadSourceMaps({ ...server, release: '1', dir, deleteAfter: true });

    expect(existsSync(join(dir, 'chunks', 'main-1a2b.js.map'))).toBe(false);
    expect(existsSync(join(dir, 'chunks', 'main-1a2b.js'))).toBe(true);
  });

  it('reports a refused upload', async () => {
    fetchMock.mockImplementation(async () => new Response('bad key', { status: 401 }));

    await expect(uploadSourceMaps({ ...server, release: '1', dir })).rejects.toThrow('401');
  });

  it('needs a host, website and key', async () => {
    await expect(uploadSourceMaps({ release: '1', dir })).rejects.toThrow('GHOSTWIRE_HOST');
  });
});

describe('releases', () => {
  it('registers a deploy', async () => {
    fetchMock.mockImplementation(async () => new Response('{"version":"2.4.1"}'));

    await registerRelease({ ...server, version: '2.4.1', environment: 'production' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://gw.example.com/api/websites/w1/releases');
    expect(JSON.parse(init.body)).toEqual({ version: '2.4.1', environment: 'production' });
  });

  it('detects the release from CI', () => {
    expect(detectRelease({ GITHUB_SHA: 'abc' })).toBe('abc');
    expect(detectRelease({ GHOSTWIRE_RELEASE: '2.4.1', GITHUB_SHA: 'abc' })).toBe('2.4.1');
    expect(detectRelease({})).toBeUndefined();
  });
});

describe('cli', () => {
  it('uploads with flags', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const code = await main([
      'sourcemaps',
      'upload',
      '--dir',
      dir,
      '--url-prefix=/assets',
      '--release',
      '9.9.9',
      '--host',
      server.host,
      '--website',
      'w1',
      '--key',
      'gwe_test',
    ]);

    expect(code).toBe(0);
    expect(log).toHaveBeenLastCalledWith('Release 9.9.9: 2 of 2 source maps saved.');
    log.mockRestore();
  });

  it('prints help for unknown commands', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    expect(await main(['nope'])).toBe(1);
    expect(log.mock.calls[0][0]).toContain('ghostwire sourcemaps upload');
    log.mockRestore();
  });
});
