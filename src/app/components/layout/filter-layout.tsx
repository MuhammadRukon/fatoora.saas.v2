import React from 'react';
export function FilterLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className=" bg-gray-100 dark:bg-[#222223]">
      <div className="space-y-4">
        <div>
          <p className="p-3">{title}</p>
          <hr className="border-white dark:border-black" />

          <div className="p-3 space-y-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
