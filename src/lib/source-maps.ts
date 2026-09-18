/*
 * Source maps: stored per website, release and minified file (by URL path), and used to turn
 * minified stack frames back into the original file, line, function and a few lines of code.
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import { SourceMapConsumer } from 'source-map-js';
import { uuid } from '@/lib/crypto';
import type { StackFrame } from '@/lib/errors';
import prisma from '@/lib/prisma';

export const MAX_SOURCE_MAP_BYTES = 30 * 1024 * 1024;
const CONTEXT_LINES = 3;
const MAX_LINE_LENGTH = 200;
const CACHE_SIZE = 30;
const MISS_TTL_MS = 60_000;

/** The URL path a frame's file is served from, e.g. /_next/static/chunks/main-1a2b.js */
export function toFilePath(file: string | null | undefined) {
  if (!file) return null;

  try {
    const path = new URL(file, 'http://localhost').pathname;
    return path && path !== '/' ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

/** Checks that `content` is a source map and returns it compressed for storage. */
export function prepareSourceMap(content: Buffer | string) {
  const text = typeof content === 'string' ? content : content.toString('utf8');
  let map: any;

  try {
    map = JSON.parse(text);
  } catch {
    throw new Error('Not valid JSON.');
  }

  if (map?.version !== 3 || (typeof map.mappings !== 'string' && !Array.isArray(map.sections))) {
    throw new Error('Not a version 3 source map.');
  }

  return gzipSync(text);
}

export async function saveSourceMap(
  websiteId: string,
  release: string,
  fileName: string,
  content: Buffer | string,
) {
  const compressed = prepareSourceMap(content);
  const size = typeof content === 'string' ? Buffer.byteLength(content) : content.length;

  await prisma.client.sourceMap.upsert({
    where: { websiteId_release_fileName: { websiteId, release, fileName } },
    create: { id: uuid(), websiteId, release, fileName, content: compressed, size },
    update: { content: compressed, size, createdAt: new Date() },
  });

  forget(websiteId, release, fileName);
}

type Cached = { consumer: SourceMapConsumer } | { missUntil: number };
const cache = new Map<string, Cached>();
const cacheKey = (websiteId: string, release: string, fileName: string) =>
  `${websiteId}\n${release}\n${fileName}`;

function forget(websiteId: string, release: string, fileName: string) {
  cache.delete(cacheKey(websiteId, release, fileName));
}

async function getConsumer(websiteId: string, release: string, fileName: string) {
  const key = cacheKey(websiteId, release, fileName);
  const cached = cache.get(key);

  if (cached) {
    if ('consumer' in cached) {
      // Refresh its place in the LRU order.
      cache.delete(key);
      cache.set(key, cached);
      return cached.consumer;
    }
    if (cached.missUntil > Date.now()) return null;
  }

  const row = await prisma.client.sourceMap.findUnique({
    where: { websiteId_release_fileName: { websiteId, release, fileName } },
    select: { content: true },
  });

  if (!row) {
    cache.set(key, { missUntil: Date.now() + MISS_TTL_MS });
    return null;
  }

  const consumer = new SourceMapConsumer(JSON.parse(gunzipSync(row.content).toString('utf8')));

  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, { consumer });

  return consumer;
}

function cleanSource(source: string) {
  return source
    .replace(/^webpack:\/\/(?:_N_E\/)?/, '')
    .replace(/^turbopack:\/\/\/?(?:\[project\]\/)?/, '')
    .replace(/^(?:\.\.?\/)+/, '')
    .replace(/^\/+/, '');
}

function snippet(consumer: SourceMapConsumer, source: string, line: number) {
  const content = consumer.sourceContentFor(source, true);
  if (!content) return undefined;

  const lines = content.split(/\r?\n/);
  const cut = (value: string) => value.slice(0, MAX_LINE_LENGTH);
  const index = line - 1;
  if (index < 0 || index >= lines.length) return undefined;

  return {
    pre: lines.slice(Math.max(0, index - CONTEXT_LINES), index).map(cut),
    line: cut(lines[index]),
    post: lines.slice(index + 1, index + 1 + CONTEXT_LINES).map(cut),
  };
}

/**
 * Maps frames back to original source where a source map for the release exists. Frames that
 * can't be mapped are returned unchanged. Never throws.
 */
export async function resolveFrames(
  websiteId: string,
  release: string | null | undefined,
  frames: StackFrame[],
): Promise<{ frames: StackFrame[]; resolved: boolean }> {
  if (!release || !frames.length) return { frames, resolved: false };

  // Map every frame first: each one's name comes from the next frame's call site.
  const positions = await Promise.all(
    frames.map(async frame => {
      if (frame.minified || !frame.line || !frame.column) return null;

      try {
        const fileName = toFilePath(frame.file);
        if (!fileName) return null;

        const consumer = await getConsumer(websiteId, release, fileName);
        if (!consumer) return null;

        const position = consumer.originalPositionFor({
          line: frame.line,
          // Stack traces count columns from 1, source maps from 0.
          column: Math.max(0, frame.column - 1),
        });
        if (!position.source || !position.line) return null;

        return { consumer, ...position, source: position.source, line: position.line };
      } catch {
        return null;
      }
    }),
  );

  const mapped = frames.map((frame, index) => {
    const position = positions[index];
    if (!position) return frame;

    const file = cleanSource(position.source);
    // The name at the caller's position is the name of the function it called: this one.
    const name = positions[index + 1]?.name ?? null;

    return {
      file,
      function: name,
      line: position.line,
      column: position.column === null ? null : position.column + 1,
      inApp: frame.inApp && !/(^|\/)node_modules\//.test(file),
      minified: {
        file: frame.file,
        line: frame.line,
        column: frame.column,
        function: frame.function,
      },
      context: snippet(position.consumer, position.source, position.line),
    } satisfies StackFrame;
  });

  const resolved = positions.some(Boolean);
  return { frames: mapped, resolved };
}

/** For tests. */
export function clearSourceMapCache() {
  cache.clear();
}
