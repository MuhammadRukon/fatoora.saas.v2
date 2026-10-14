import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { resolveBusinessId } from '@/server/business/business-context';
import { BusinessRequiredError } from '@/server/common/errors';

/** Every /app page except /app/business needs a business profile first. */
export default async function RequireBusinessLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const hasBusiness = await resolveBusinessId(session.user.id).then(
    () => true,
    (err) => {
      if (err instanceof BusinessRequiredError) return false;
      throw err;
    },
  );
  if (!hasBusiness) redirect('/app/business?setup=1');
  return children;
}
