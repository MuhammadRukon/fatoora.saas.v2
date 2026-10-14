import { redirect } from 'next/navigation';

import { auth } from '@/auth';

/**
 * User area (/app, /plans). proxy.ts fast-fails at the edge; this server check
 * is the enforcement of record for the USER role. /app adds the sidebar shell,
 * /plans the slim header.
 */
export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'USER') redirect('/dashboard');
  return children;
}
