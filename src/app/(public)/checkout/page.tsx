import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { CheckoutClient } from '@/modules/checkout/components/checkout-client';

export default async function CheckoutPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/checkout');
  }
  return <CheckoutClient />;
}
