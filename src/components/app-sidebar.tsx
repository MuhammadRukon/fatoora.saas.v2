'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconBuildingStore,
  IconCalendarClock,
  IconFileInvoice,
  IconHome,
  IconShieldCheck,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';

import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

interface NavItem {
  title: string;
  icon: Icon;
  /** No url: the section ships in a later release and shows as "Soon". */
  url?: string;
}

const NAV: NavItem[] = [
  { title: 'Home', url: '/app', icon: IconHome },
  { title: 'Invoices', url: '/app/invoices', icon: IconFileInvoice },
  { title: 'Customers', url: '/app/customers', icon: IconUsers },
  { title: 'Business', url: '/app/business', icon: IconBuildingStore },
  { title: 'ZATCA', url: '/app/zatca', icon: IconShieldCheck },
];

const isCurrent = (pathname: string, url: string) =>
  url === '/app' ? pathname === url : pathname === url || pathname.startsWith(`${url}/`);

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: { name: string; email: string; image?: string | null };
}

/** Navigation for the user app (/app). Mirrors the admin DashboardSidebar. */
export function AppSidebar({ user, ...props }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/app" className="text-lg font-semibold">
                Fatoora
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {item.url ? (
                    <SidebarMenuButton asChild tooltip={item.title} isActive={isCurrent(pathname, item.url)}>
                      <Link href={item.url} aria-current={isCurrent(pathname, item.url) ? 'page' : undefined}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  ) : (
                    <>
                      <SidebarMenuButton disabled>
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                      <SidebarMenuBadge className="text-muted-foreground">Soon</SidebarMenuBadge>
                    </>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="sm" isActive={pathname === '/plans'}>
              <Link href="/plans">
                <IconCalendarClock />
                <span>Subscription</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
