// Builds the tracker (src/tracker) into public/script.js.
import { config as loadEnv } from 'dotenv';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

const config = {
  input: 'src/tracker/index.ts',
  output: {
    file: 'public/script.js',
    format: 'iife',
  },
  plugins: [
    typescript({ tsconfig: './tsconfig.tracker.json' }),
    replace({
      __COLLECT_API_HOST__: process.env.COLLECT_API_HOST || '',
      __COLLECT_API_ENDPOINT__: process.env.COLLECT_API_ENDPOINT || '/api/send',
      delimiters: ['', ''],
      preventAssignment: true,
    }),
    terser({ compress: { evaluate: false } }),
  ],
};

export default config;
