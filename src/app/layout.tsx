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
    default: 'Fatoora',
    template: '%s | Fatoora',
  },
  description: 'ZATCA Phase 2 e-invoicing for businesses in Saudi Arabia.',
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${googleSans.variable}`}>
      <body suppressHydrationWarning className="antialiased">
        <Providers>
          {children}
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
