'use client';

import { signOut } from 'next-auth/react';

import { Button } from '@/components/ui/button';
import { clearAuthHint } from '@/lib/auth-hint';

export function SignOutButton() {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        clearAuthHint();
        void signOut({ callbackUrl: '/login' });
      }}
    >
      Sign out
    </Button>
  );
}
