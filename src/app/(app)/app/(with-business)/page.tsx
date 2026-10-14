import Link from 'next/link';
import { IconBuildingStore, IconChevronRight, IconUsers } from '@tabler/icons-react';

import { auth } from '@/auth';
import { ZATCA_ENVIRONMENT_LABELS } from '@/contracts/business';
import { businessService } from '@/server/business/business.service';

const LINKS = [
  { href: '/app/customers', title: 'Customers', text: 'Add the businesses and people you invoice.', icon: IconUsers },
  { href: '/app/business', title: 'Business profile', text: 'Seller details printed on every invoice.', icon: IconBuildingStore },
];

// Home; invoicing and ZATCA onboarding are added here in later releases.
export default async function AppHome() {
  const session = await auth();
  const business = session?.user ? await businessService.getMine(session.user.id) : null;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{business?.nameEn ?? 'Welcome'}</h1>
        {business ? (
          <p className="text-muted-foreground">
            <span dir="rtl" lang="ar">
              {business.nameAr}
            </span>
            <span aria-hidden> · </span>VAT {business.vatNumber}
            <span aria-hidden> · </span>
            {ZATCA_ENVIRONMENT_LABELS[business.zatcaEnvironment]}
          </p>
        ) : null}
      </div>
      <ul className="divide-y border">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <link.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex flex-1 flex-col">
                <span className="font-medium">{link.title}</span>
                <span className="text-sm text-muted-foreground">{link.text}</span>
              </span>
              <IconChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
