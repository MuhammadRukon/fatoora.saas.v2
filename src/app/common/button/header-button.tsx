import Link from 'next/link';
import Image from 'next/image';
import { HeaderButtonProps } from './button.types';
import { ReactNode } from 'react';

export function HeaderButton({ button }: HeaderButtonProps) {
  const renderIcon = (): ReactNode => {
    if (!button.icon) return null;

    if (typeof button.icon === 'string') {
      return (
        <Image
          src={button.icon}
          alt={button.title}
          className="w-6 h-6 object-contain"
          width={100}
          height={100}
          quality={100}
          priority
        />
      );
    }

    return button.icon;
  };

  return (
    <Link
      href={button.href}
      className="flex items-center gap-1.5 px-3 h-full transition-all duration-200 hover:bg-gray-100 dark:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {renderIcon()}
      <h3 className="text-sm font-medium text-foreground text-nowrap">{button.title}</h3>
    </Link>
  );
}
