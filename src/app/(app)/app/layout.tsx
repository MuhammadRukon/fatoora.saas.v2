import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { subscriptionsService } from '@/server/subscriptions/subscriptions.service';

/** Subscription gate for every /app page (anything but ACTIVE goes to /plans), plus the app shell. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login'); // the (app) group layout already checked the role
  const { state } = await subscriptionsService.getState(session.user.id);
  if (state !== 'ACTIVE') redirect('/plans');

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
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
