import { ReactNode } from 'react';

export interface HeaderButtonProps {
  button: {
    href: string;
    title: string;
    icon?: string | ReactNode;
  };
}
