import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { subscriptionsService } from '@/server/subscriptions/subscriptions.service';

/** Subscription gate for every /app page: anything but ACTIVE goes to /plans. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login'); // the (app) group layout already checked the role
  const { state } = await subscriptionsService.getState(session.user.id);
  if (state !== 'ACTIVE') redirect('/plans');
  return children;
}
