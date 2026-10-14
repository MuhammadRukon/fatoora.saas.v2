import { redirect } from 'next/navigation';

import { getSession } from '@/lib/session';
import { cachedBusinessId } from '@/server/business/cached';
import { BusinessRequiredError } from '@/server/common/errors';

/** Every /app page except /app/business needs a business profile first. */
export default async function RequireBusinessLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect('/login');
  const hasBusiness = await cachedBusinessId(session.user.id).then(
    () => true,
    (err) => {
      if (err instanceof BusinessRequiredError) return false;
      throw err;
    },
  );
  if (!hasBusiness) redirect('/app/business?setup=1');
  return children;
}
