import { JSX } from 'react';

import { Logo } from '@/app/common/logo/logo.atom';

export function HeaderLogo(): JSX.Element {
  return (
    <div className="w-10 h-10 py-1 sm:py-0 order-1 sm:order-none">
      <Logo src="/logo.png" alt="logo" className="w-full h-full object-contain" />
    </div>
  );
}
