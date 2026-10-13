import type { NextConfig } from 'next';

import { buildListingRewrites } from './src/lib/listing-rewrites';

const nextConfig: NextConfig = {
  images: {
    qualities: [100, 75, 50],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  // Default listing views are ISR; any filter key sends the request to the dynamic /live twin (URL unchanged, query preserved).
  async rewrites() {
    return { beforeFiles: buildListingRewrites() };
  },
  // Trust signals for SEO/security scanners; no page embeds a frame and
  // none of ours needs to be embeddable, so DENY is safe here.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
