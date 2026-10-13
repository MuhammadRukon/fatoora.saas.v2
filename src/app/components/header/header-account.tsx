'use client';

import Link from 'next/link';
import { Moon, Sun, User as UserIcon } from 'lucide-react';

import { useSession } from 'next-auth/react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import Logout from '@/components/common/logout';
import { cn } from '@/lib/utils';

/**
 * Header authentication slot. Shows a Login link when signed out,
 * or a small dropdown with the user's name and a Logout button.
 */
export function HeaderAccount() {
  const { data, status } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  if (status === 'loading') {
    return <div className="h-6 w-6 animate-pulse rounded bg-muted" aria-hidden />;
  }

  if (!data?.user) {
    return (
      <Link
        href="/login"
        className={`flex items-center gap-1.5 px-3  h-full transition-all duration-200 hover:bg-gray-100 dark:hover:bg-accent`}
      >
        <UserIcon size={18} />
        <span className="text-sm font-medium text-foreground text-nowrap">Login</span>
      </Link>
    );
  }

  const isAdmin = data.user.role === 'ADMIN';

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center  gap-1.5 $ h-full transition-all cursor-pointer duration-200  outline-none',
          !data?.user && 'bg-gray-100 dark:bg-input/30 px-3 md:px-4',
        )}
      >
        <UserIcon size={18} />
        {!data?.user && 'Login'}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{data.user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account/orders">My orders</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/addresses">Saved addresses</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/reviews">Write a review</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/account/settings">Change password</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <button
            type="button"
            className="w-full"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          >
            Switch to {isDark ? 'light' : 'dark'} mode{' '}
            {isDark ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href="/dashboard">Admin dashboard</Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <Logout />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
