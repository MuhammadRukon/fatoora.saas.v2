'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function ProductFilterWrapper({
  filters,
  children,
}: {
  filters: React.ReactNode;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex gap-6 mt-3 mb-6">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          `
          hidden
          md:block
          shrink-0
          transition-all
          duration-300
          ease-in-out
          `,
          sidebarOpen ? 'w-80 opacity-100' : 'w-0 opacity-0 overflow-hidden',
        )}
      >
        <div
          className="
            sticky
            top-[112px]
            max-h-[calc(100vh-128px)]
            overflow-y-auto
          "
        >
          {filters}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <Button
          variant="outline"
          size="sm"
          className="mb-4 hidden md:flex"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <SlidersHorizontal className="mr-2 size-4" />
          {sidebarOpen ? 'Hide' : 'Show'} Filters
        </Button>

        {/* Mobile */}
        <div className="mb-4 md:hidden">{filters}</div>

        {children}
      </main>
    </div>
  );
}
