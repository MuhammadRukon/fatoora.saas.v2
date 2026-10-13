import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { Button } from '@/components/ui/button';

export const metadata = {
  title: 'ZATCA e-invoicing',
  description: 'Issue ZATCA Phase 2 compliant e-invoices for your business.',
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  // Post-login landing (login and Google default to '/'): send each role to its area.
  const session = await auth();
  if (session?.user) redirect(session.user.role === 'ADMIN' ? '/dashboard' : '/app');

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 text-center">
      <h1 className="text-3xl font-semibold md:text-4xl">Fatoora</h1>
      <p className="max-w-md text-muted-foreground">
        ZATCA Phase 2 e-invoicing for businesses in Saudi Arabia.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/login">Login</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/signup">Sign up</Link>
        </Button>
      </div>
    </div>
  );
}
