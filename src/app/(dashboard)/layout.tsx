import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

/**
 * Admin shell. `proxy.ts` (Next 16's middleware convention) already
 * enforces ADMIN role at the edge, but we re-check here so that:
 * 1. The session is loaded once and passed down (no client `useSession`).
 * 2. Defense in depth in case the matcher misses an edge case.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login?callbackUrl=/dashboard');
  }
  if (session.user.role !== 'ADMIN') {
    redirect('/');
  }

  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <DashboardSidebar
        variant="inset"
        user={{
          name: session.user.name ?? 'Admin',
          email: session.user.email ?? '',
          image: session.user.image,
        }}
      />
      <SidebarInset>
        <SiteHeader />
        <div className="p-4 md:p-6 flex-1">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
