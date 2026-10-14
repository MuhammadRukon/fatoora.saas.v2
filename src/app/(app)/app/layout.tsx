import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/session';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { isReadOnlyAppPath } from '@/lib/app-access';
import { cachedSubscriptionState } from '@/server/subscriptions/cached';

/**
 * Subscription gate for every /app page (anything but ACTIVE goes to /plans), plus the app shell.
 * Exception: an EXPIRED subscription may open the invoice list, detail and print pages read-only.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect('/login'); // the (app) group layout already checked the role
  const { state } = await cachedSubscriptionState(session.user.id);
  const readOnly = state === 'EXPIRED' && isReadOnlyAppPath((await headers()).get('x-pathname'));
  if (state !== 'ACTIVE' && !readOnly) redirect('/plans');

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 64)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        user={{
          name: session.user.name ?? '',
          email: session.user.email ?? '',
          image: session.user.image,
        }}
      />
      {/* min-w-0: wide tables scroll inside their container, not the page */}
      <SidebarInset className="min-w-0">
        <SiteHeader />
        <div className="flex-1 p-4 md:p-8">
          {readOnly ? (
            <Alert className="mb-6">
              <AlertDescription>
                Subscription expired: read-only,{' '}
                <Link href="/plans" className="font-medium underline underline-offset-4">
                  renew at /plans
                </Link>
                .
              </AlertDescription>
            </Alert>
          ) : null}
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
