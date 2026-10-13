'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DropdownMenuItem } from '../ui/dropdown-menu';
import { toast } from 'sonner';
import { signOut } from 'next-auth/react';
import { queryKeys } from '@/constants/queryKeys';
import { clearAuthHint } from '@/lib/auth-hint';
import { useQueryClient } from '@tanstack/react-query';

export default function Logout() {
  const router = useRouter();

  const qc = useQueryClient();

  async function onLogout() {
    try {
      await signOut({ redirect: false });
      clearAuthHint();
      toast.success('Logged out successfully');
      qc.resetQueries({ queryKey: queryKeys.cart });
      router.refresh();
    } catch (error) {
      toast.error('Failed to logout');
      console.error(error);
    }
  }
  return (
    <button type="button" className="w-full" onClick={onLogout}>
      <DropdownMenuItem asChild>
        <span className="flex w-full items-center gap-2">
          <LogOut size={14} />
          Log out
        </span>
      </DropdownMenuItem>
    </button>
  );
}
