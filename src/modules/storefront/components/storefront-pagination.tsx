'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { Button } from '@/components/ui/button';

interface Props {
  page: number;
  pageSize: number;
  total: number;
}

export function StorefrontPagination({ page, pageSize, total }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function withPage(next: number): string {
    const sp = new URLSearchParams(params);
    sp.set('page', String(next));
    return `${pathname}?${sp.toString()}`;
  }

  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between mt-6">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages} · {total} result{total === 1 ? '' : 's'}
      </p>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={page <= 1}>
          {page <= 1 ? <span>Previous</span> : <Link href={withPage(page - 1)} prefetch={false}>Previous</Link>}
        </Button>
        <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
          {page >= totalPages ? <span>Next</span> : <Link href={withPage(page + 1)} prefetch={false}>Next</Link>}
        </Button>
      </div>
    </div>
  );
}
