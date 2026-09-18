// Builds the session replay / heatmap recorder (src/recorder, bundles rrweb) into public/recorder.js.
import { config as loadEnv } from 'dotenv';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';

loadEnv({ path: ['.env.local', '.env'], quiet: true });

const config = {
  input: 'src/recorder/index.js',
  output: {
    file: 'public/recorder.js',
    format: 'iife',
  },
  plugins: [
    resolve({ browser: true }),
    commonjs(),
    replace({
      __COLLECT_API_HOST__: process.env.COLLECT_API_HOST || '',
      delimiters: ['', ''],
      preventAssignment: true,
    }),
    terser({ compress: { evaluate: false } }),
  ],
};

export default config;
