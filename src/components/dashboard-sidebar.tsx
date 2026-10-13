'use client';

import * as React from 'react';
import {
  IconBrandBooking,
  IconBrandProducthunt,
  IconCash,
  IconCategory,
  IconDashboard,
  IconDiscount,
  IconReceipt,
  IconSettings,
  IconShieldCheck,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';

import { NavMain } from '@/components/nav-main';
import { NavSecondary } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Logo } from '@/app/common/logo/logo.atom';

interface AppSidebarUser {
  name: string;
  email: string;
  image?: string | null;
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  user: AppSidebarUser;
}

const navMain: { title: string; url: string; icon: Icon }[] = [
  { title: 'Dashboard', url: '/dashboard', icon: IconDashboard },
  { title: 'Orders', url: '/dashboard/orders', icon: IconReceipt },
  { title: 'Payments', url: '/dashboard/payments', icon: IconCash },
  { title: 'Warranty', url: '/dashboard/warranty', icon: IconShieldCheck },
  { title: 'Products', url: '/dashboard/products', icon: IconBrandProducthunt },
  { title: 'Categories', url: '/dashboard/categories', icon: IconCategory },
  { title: 'Brands', url: '/dashboard/brands', icon: IconBrandBooking },
  { title: 'Coupons', url: '/dashboard/coupons', icon: IconDiscount },
  { title: 'Users', url: '/dashboard/users', icon: IconUsers },
];

const navSecondary: { title: string; url: string; icon: Icon }[] = [
  { title: 'Settings', url: '/dashboard/settings', icon: IconSettings },
];

export function DashboardSidebar({ user, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Logo alt="logo" className="w-full h-12 object-contain" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
