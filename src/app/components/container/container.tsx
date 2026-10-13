import { JSX } from 'react';
import { cn } from '@/lib/utils';

export interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function Container({ children, className = '' }: Readonly<ContainerProps>): JSX.Element {
  return <div className={cn('max-w-7xl mx-auto px-4 sm:px-14', className)}>{children}</div>;
}
