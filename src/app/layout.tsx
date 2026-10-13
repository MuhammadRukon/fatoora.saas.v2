import type { Metadata } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';
import { Analytics } from '@vercel/analytics/next';
import localFont from 'next/font/local';

import { env } from '@/env';

const googleSans = localFont({
  src: [
    {
      path: './fonts/GoogleSans-Regular.woff2',
      weight: '400',
    },
    {
      path: './fonts/GoogleSans-Medium.woff2',
      weight: '500',
    },
    {
      path: './fonts/GoogleSans-SemiBold.woff2',
      weight: '600',
    },
  ],
  display: 'swap',
  variable: '--font-google-sans',
});

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: 'Cryptech',
    template: '%s | Cryptech',
  },
  description: 'Modern gadgets and electronics ecommerce platform.',
  twitter: {
    card: 'summary_large_image',
  },
};

// Site-wide Organization + WebSite JSON-LD. Static (no per-request data),
// so it's safe to compute once at module scope rather than per-render.
// WebSite's SearchAction targets the existing /products?q= search (see
// docs/SEO-AUDIT.md LOW item 14) to make Google eligible for a sitelinks
// search box.
const siteJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Cryptech',
    url: env.NEXT_PUBLIC_APP_URL,
    logo: `${env.NEXT_PUBLIC_APP_URL}/logo.png`,
  },
  {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Cryptech',
    url: env.NEXT_PUBLIC_APP_URL,
    potentialAction: {
      '@type': 'SearchAction',
      target: `${env.NEXT_PUBLIC_APP_URL}/products?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${googleSans.variable}`}>
      <body suppressHydrationWarning className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }}
        />
        <Providers>
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
