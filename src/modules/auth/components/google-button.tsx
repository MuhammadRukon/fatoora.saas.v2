'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { authLandingUrl } from '@/lib/auth-hint';

interface GoogleButtonProps {
  callbackUrl?: string;
  disabled?: boolean;
  label?: string;
}

export function GoogleButton({
  callbackUrl = '/',
  disabled,
  label = 'Continue with Google',
}: GoogleButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={disabled}
      onClick={() => signIn('google', { callbackUrl: authLandingUrl(callbackUrl) })}
    >
      {label}
    </Button>
  );
}
