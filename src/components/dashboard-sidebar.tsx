'use client';

import * as React from 'react';
import Link from 'next/link';
import { IconDashboard, IconUsers, type Icon } from '@tabler/icons-react';

import { NavMain } from '@/components/nav-main';
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
  { title: 'Users', url: '/dashboard/users', icon: IconUsers },
];

export function DashboardSidebar({ user, ...props }: AppSidebarProps) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <Link href="/" className="text-lg font-semibold">
                Fatoora
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
