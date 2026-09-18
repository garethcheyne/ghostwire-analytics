import type { NextConfig } from 'next';
import pkg from './package.json' with { type: 'json' };

// Static headers. Anything that depends on runtime env (tracker names, collect endpoint, CSP)
// is handled in src/proxy.ts so Docker env changes apply without a rebuild.
const apiHeaders = [
  { key: 'Access-Control-Allow-Origin', value: '*' },
  { key: 'Access-Control-Allow-Headers', value: '*' },
  { key: 'Access-Control-Allow-Methods', value: 'GET, DELETE, POST, PUT' },
  { key: 'Access-Control-Max-Age', value: process.env.CORS_MAX_AGE || '86400' },
  { key: 'Cache-Control', value: 'no-cache' },
];

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  ...(process.env.FORCE_SSL
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: process.env.BASE_PATH || '',
  env: {
    currentVersion: pkg.version,
  },
  async headers() {
    return [
      { source: '/api/:path*', headers: apiHeaders },
      { source: '/:path*', headers: securityHeaders },
    ];
  },
};

export default nextConfig;
