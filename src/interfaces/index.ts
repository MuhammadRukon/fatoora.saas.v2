import { ReactNode } from 'react';

export interface IBaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBaseNamedEntity extends IBaseEntity {
  name: string;
  slug: string;
  isPopular: boolean;
}

export interface IHeaderButton {
  href: string;
  title: string;
  icon?: string | ReactNode;
}

export interface IBrandOption {
  id: string;
  name: string;
  slug: string;
}
export interface ICategoryOption {
  id: string;
  name: string;
  slug: string;
}
