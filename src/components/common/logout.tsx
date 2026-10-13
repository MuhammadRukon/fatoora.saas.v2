'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DropdownMenuItem } from '../ui/dropdown-menu';
import { toast } from 'sonner';
import { signOut } from 'next-auth/react';
import { clearAuthHint } from '@/lib/auth-hint';

export default function Logout() {
  const router = useRouter();

  async function onLogout() {
    try {
      await signOut({ redirect: false });
      clearAuthHint();
      toast.success('Logged out successfully');
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
