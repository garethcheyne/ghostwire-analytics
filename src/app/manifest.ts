import type { MetadataRoute } from 'next';

const base = process.env.BASE_PATH || '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${base}/`,
    name: 'Ghostwire Analytics',
    short_name: 'Analytics',
    description: 'Self-hosted, privacy-first web analytics.',
    start_url: `${base}/websites`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: `${base}/icons/maskable-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Websites', url: `${base}/websites` },
      { name: 'Dashboard', url: `${base}/dashboard` },
      { name: 'Notifications', url: `${base}/settings/notifications` },
    ],
  };
}
