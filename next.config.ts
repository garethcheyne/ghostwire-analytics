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
  // Dev server only: let other machines on the local network open it (e.g. http://192.168.0.x:3000).
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '*.local'],
  env: {
    currentVersion: pkg.version,
    basePath: process.env.BASE_PATH || '',
  },
  async headers() {
    return [
      { source: '/api/:path*', headers: apiHeaders },
      { source: '/:path*', headers: securityHeaders },
      {
        // Browsers check for a new service worker on every visit; never serve a stale one.
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;
