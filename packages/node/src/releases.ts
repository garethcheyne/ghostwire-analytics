/*
 * Deploy-time helpers: register a release and upload its source maps, so errors in minified
 * code show your original files. Used by the `ghostwire` CLI and callable from build scripts.
 */
import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

export interface ServerOptions {
  /** Your Ghostwire Analytics server. Default: GHOSTWIRE_HOST. */
  host?: string;
  /** Default: GHOSTWIRE_WEBSITE_ID. */
  websiteId?: string;
  /** The website's server key (gwe_…). Default: GHOSTWIRE_ERROR_KEY. */
  key?: string;
}

/** The release from the environment: GHOSTWIRE_RELEASE, or the commit on Vercel/GitHub/GitLab. */
export function detectRelease(env: Record<string, string | undefined> = process.env) {
  return (
    env.GHOSTWIRE_RELEASE ||
    env.VERCEL_GIT_COMMIT_SHA ||
    env.GITHUB_SHA ||
    env.CI_COMMIT_SHA ||
    env.RENDER_GIT_COMMIT ||
    undefined
  );
}

function server(options: ServerOptions) {
  const host = (options.host ?? process.env.GHOSTWIRE_HOST ?? '').replace(/\/+$/, '');
  const websiteId = options.websiteId ?? process.env.GHOSTWIRE_WEBSITE_ID ?? '';
  const key = options.key ?? process.env.GHOSTWIRE_ERROR_KEY ?? '';

  if (!host || !websiteId || !key) {
    throw new Error(
      'Set the host, website ID and server key (GHOSTWIRE_HOST, GHOSTWIRE_WEBSITE_ID, GHOSTWIRE_ERROR_KEY).',
    );
  }

  return { url: `${host}/api/websites/${websiteId}`, headers: { authorization: `Bearer ${key}` } };
}

async function check(response: Response): Promise<any> {
  if (response.ok) return response.json();

  const body = await response.text().catch(() => '');
  throw new Error(`Ghostwire responded ${response.status}: ${body.slice(0, 300)}`);
}

export interface ReleaseInput extends ServerOptions {
  version: string;
  environment?: string;
  commit?: string;
  /** A link to the commit or changelog. */
  url?: string;
}

/** Marks a deploy; it shows on the traffic chart and the Releases page. */
export async function registerRelease({
  version,
  environment,
  commit,
  url,
  ...options
}: ReleaseInput) {
  const { url: base, headers } = server(options);

  return check(
    await fetch(`${base}/releases`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ version, environment, commit, url }),
    }),
  );
}

async function findMaps(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return findMaps(path);
      return Promise.resolve(entry.name.endsWith('.js.map') ? [path] : []);
    }),
  );

  return nested.flat();
}

export interface UploadInput extends ServerOptions {
  release: string;
  /** Build output folder to search for *.js.map, e.g. .next/static or dist/assets. */
  dir: string;
  /**
   * The URL path the folder is served from, e.g. /_next/static for .next/static. A map at
   * <dir>/chunks/main.js.map is then stored for /_next/static/chunks/main.js.
   */
  urlPrefix?: string;
  /** Delete the .map files after uploading, so they aren't deployed publicly. */
  deleteAfter?: boolean;
  /** Called after each batch, e.g. for progress output. */
  onProgress?: (done: number, total: number) => void;
}

const BATCH_FILES = 20;
const BATCH_BYTES = 40 * 1024 * 1024;

/** Uploads every *.js.map under `dir` for `release`. */
export async function uploadSourceMaps({
  release,
  dir,
  urlPrefix = '/',
  deleteAfter = false,
  onProgress,
  ...options
}: UploadInput) {
  const { url, headers } = server(options);
  const maps = await findMaps(dir);
  const prefix = `/${urlPrefix.replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
  const failed: { file: string; error: string }[] = [];
  let saved = 0;

  const batches: string[][] = [];
  let batch: string[] = [];
  let bytes = 0;

  for (const path of maps) {
    const size = (await stat(path)).size;
    if (batch.length && (batch.length >= BATCH_FILES || bytes + size > BATCH_BYTES)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(path);
    bytes += size;
  }
  if (batch.length) batches.push(batch);

  let done = 0;
  for (const paths of batches) {
    const form = new FormData();
    form.set('release', release);

    for (const path of paths) {
      const urlPath = `${prefix}/${relative(dir, path).split(sep).join('/')}`;
      form.append('file', new Blob([new Uint8Array(await readFile(path))]), urlPath);
    }

    const result = await check(
      await fetch(`${url}/sourcemaps`, { method: 'POST', headers, body: form }),
    );
    saved += result.saved;
    failed.push(...result.failed);
    done += paths.length;
    onProgress?.(done, maps.length);
  }

  if (deleteAfter) await Promise.all(maps.map(path => unlink(path)));

  return { found: maps.length, saved, failed };
}
