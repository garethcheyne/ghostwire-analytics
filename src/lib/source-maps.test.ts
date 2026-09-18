import { gzipSync } from 'node:zlib';
import { SourceMapGenerator } from 'source-map-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();

vi.mock('@/lib/prisma', () => ({
  default: { client: { sourceMap: { findUnique, upsert: vi.fn() } } },
}));

const { clearSourceMapCache, prepareSourceMap, resolveFrames, toFilePath } =
  await import('./source-maps');

const SOURCE = [
  'export function CheckoutForm() {',
  '  const cart = useCart();',
  '  function submitOrder() {',
  '    return cart.total.toFixed(2);',
  '  }',
  '  return submitOrder;',
  '}',
  'export const run = () => CheckoutForm()();',
].join('\n');

const SOURCE_URL = 'webpack://_N_E/./src/app/checkout/CheckoutForm.tsx';

/** Minified 1:120 is CheckoutForm.tsx 4:17 (in submitOrder); 1:200 is the call in run(). */
function makeMap() {
  const generator = new SourceMapGenerator({ file: 'page-4f2a9c1b.js' });
  generator.addMapping({
    generated: { line: 1, column: 119 },
    original: { line: 4, column: 16 },
    source: SOURCE_URL,
    name: 'toFixed',
  });
  // The call site in run(): the name here is the called function's.
  generator.addMapping({
    generated: { line: 1, column: 199 },
    original: { line: 8, column: 25 },
    source: SOURCE_URL,
    name: 'submitOrder',
  });
  generator.setSourceContent(SOURCE_URL, SOURCE);
  return generator.toString();
}

const FILE = 'https://shop.example.com/_next/static/chunks/app/page-4f2a9c1b.js?v=1';
const minified = { file: FILE, function: 'a', line: 1, column: 120, inApp: true };
const caller = { file: FILE, function: 'b', line: 1, column: 200, inApp: true };

beforeEach(() => {
  clearSourceMapCache();
  findUnique.mockReset();
});

describe('source maps', () => {
  it('uses the URL path of a frame as the file name', () => {
    expect(toFilePath(minified.file)).toBe('/_next/static/chunks/app/page-4f2a9c1b.js');
    expect(toFilePath('/static/js/main.js')).toBe('/static/js/main.js');
    expect(toFilePath('')).toBeNull();
  });

  it('rejects files that are not source maps', () => {
    expect(() => prepareSourceMap('not json')).toThrow('Not valid JSON.');
    expect(() => prepareSourceMap('{"version":2}')).toThrow('version 3');
    expect(prepareSourceMap(makeMap())).toBeInstanceOf(Buffer);
  });

  it('maps minified frames to the original file, line, function and code', async () => {
    findUnique.mockResolvedValue({ content: gzipSync(makeMap()) });

    const { frames, resolved } = await resolveFrames('w1', '2.4.1', [minified, caller]);

    expect(resolved).toBe(true);
    expect(findUnique.mock.calls[0][0].where.websiteId_release_fileName).toEqual({
      websiteId: 'w1',
      release: '2.4.1',
      fileName: '/_next/static/chunks/app/page-4f2a9c1b.js',
    });
    expect(frames[0]).toMatchObject({
      file: 'src/app/checkout/CheckoutForm.tsx',
      // Named from the caller's call site, not the token at its own position (toFixed).
      function: 'submitOrder',
      line: 4,
      column: 17,
      inApp: true,
      minified: { file: FILE, line: 1, column: 120, function: 'a' },
    });
    expect(frames[0].context).toEqual({
      pre: SOURCE.split('\n').slice(0, 3),
      line: '    return cart.total.toFixed(2);',
      post: SOURCE.split('\n').slice(4, 7),
    });
    // Nothing calls into the outermost frame here, so its name stays unknown.
    expect(frames[1]).toMatchObject({ line: 8, function: null });
  });

  it('leaves frames alone without a release or a map, and caches misses', async () => {
    findUnique.mockResolvedValue(null);

    expect((await resolveFrames('w1', null, [minified])).resolved).toBe(false);
    await resolveFrames('w1', '2.4.1', [minified]);
    const { frames, resolved } = await resolveFrames('w1', '2.4.1', [minified]);

    expect(resolved).toBe(false);
    expect(frames[0]).toBe(minified);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
