import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { Suspense } from 'react';
import { AskDealerPulse } from '@/components/AskDealerPulse';
import { Sidebar } from '@/components/Sidebar';
import { getStore } from '@/lib/data';
import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'DealerPulse', template: '%s · DealerPulse' },
  description: 'Sales performance and follow-up alerts for a multi-branch dealership group.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#14213d',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const store = getStore();
  const branches = store.branches.map((b) => ({ id: b.id, name: b.name, city: b.city }));
  // Staff names and IDs only, for the Ask DealerPulse scope chip.
  const reps = store.reps.map((r) => ({ id: r.id, name: r.name, branchId: r.branch_id }));
  const months = { first: store.months[0] ?? '', last: store.months[store.months.length - 1] ?? '' };

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-sans">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Suspense fallback={<div className="h-14 bg-ink lg:h-auto lg:w-60" />}>
            <Sidebar branches={branches} />
          </Suspense>
          <main className="min-w-0 flex-1 px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">{children}</main>
        </div>
        {/* Reads the URL for its scope, so it needs its own Suspense boundary. */}
        <Suspense fallback={null}>
          <AskDealerPulse branches={branches} reps={reps} months={months} />
        </Suspense>
      </body>
    </html>
  );
}
