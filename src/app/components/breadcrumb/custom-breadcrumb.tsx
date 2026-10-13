import { uppercase } from '@/app/utils/helper';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

import React from 'react';

export interface BreadcrumbItem {
  label: string | undefined;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

/**
 * schema.org BreadcrumbList JSON-LD for the same trail rendered by
 * CustomBreadcrumb. `baseUrl` is the site origin (no trailing slash);
 * entries without `href` (typically the current page) are omitted from
 * `item`, matching Google's guidance that the last crumb's URL is optional.
 */
export function buildBreadcrumbJsonLd(items: BreadcrumbItem[], baseUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${baseUrl}${item.href}` } : {}),
    })),
  };
}

export function CustomBreadcrumb({ items }: Readonly<BreadcrumbProps>) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => (
          <React.Fragment key={index}>
            <BreadcrumbItem>
              {index === items.length - 1 ? (
                <BreadcrumbPage>{uppercase(item.label as string)}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={item.href ?? '#'}>
                  {uppercase(item.label as string)}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < items.length - 1 && <BreadcrumbSeparator />}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
