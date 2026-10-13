import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { SignOutButton } from '@/components/common/sign-out-button';

/**
 * Shell for the user area (/app, /plans). proxy.ts fast-fails at the edge;
 * this server check is the enforcement of record for the USER role.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'USER') redirect('/dashboard');

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Link href="/app" className="font-semibold">
            Fatoora
          </Link>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/plans" className="hover:text-foreground">
              Plans
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
