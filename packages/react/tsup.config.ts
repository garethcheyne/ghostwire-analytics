import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  // Not rollup tree-shaking: it strips the "use client" banner. esbuild still drops dead code.
  treeshake: false,
  external: ['react'],
  // The provider and hooks run on the client (Next.js App Router needs the directive).
  banner: { js: '"use client";' },
});
