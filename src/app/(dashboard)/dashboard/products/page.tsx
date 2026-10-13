'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { IconAlertTriangle, IconDotsVertical } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable } from '@/components/data-table';
import { Alert } from '@/app/components/alert/alert';

import { useAdminProductMutations, useAdminProducts } from '@/modules/admin/catalog/hooks';
import { formatBDT } from '@/server/common/money';
import type { AdminProductRow } from '@/server/catalog/catalog.repo';
import { useRouter } from 'next/navigation';

function variantSummary(row: AdminProductRow) {
  const cheapest = row.variants
    .filter((v) => v.isActive)
    .sort((a, b) => a.sellingPriceCents - b.sellingPriceCents)[0];
  const totalStock = row.variants.reduce((sum, v) => sum + v.stock, 0);
  const lowStock = row.variants.some(
    (v) => v.isActive && v.stock <= v.lowStockThreshold,
  );
  return { cheapest, totalStock, lowStock };
}

export default function AdminProductsPage() {
  const router = useRouter();
  const { data: products = [], isLoading } = useAdminProducts();
  const { remove } = useAdminProductMutations();
  const [pendingDelete, setPendingDelete] = useState<AdminProductRow | null>(null);

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
    } finally {
      setPendingDelete(null);
    }
  }

  const columns: ColumnDef<AdminProductRow>[] = [
    {
      accessorKey: 'image',
      header: 'Image',
      cell: ({ row }) => {
        const img = row.original.images[0];
        return img ? (
          <div className="w-12 h-12 relative rounded overflow-hidden bg-muted">
            <Image src={img.url} alt={row.original.name} fill className="object-cover" />
          </div>
        ) : (
          <div className="w-12 h-12 rounded bg-muted" />
        );
      },
    },
    {
      accessorKey: 'name',
      header: 'Product',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-muted-foreground text-xs">{row.original.slug}</span>
        </div>
      ),
    },
    {
      accessorKey: 'brand',
      header: 'Brand',
      cell: ({ row }) => row.original.brand?.name ?? '-',
    },
    {
      accessorKey: 'price',
      header: 'Price',
      cell: ({ row }) => {
        const { cheapest } = variantSummary(row.original);
        if (!cheapest) return '-';
        return formatBDT(cheapest.sellingPriceCents);
      },
    },
    {
      accessorKey: 'stock',
      header: 'Stock',
      cell: ({ row }) => {
        const { totalStock, lowStock } = variantSummary(row.original);
        return (
          <span
            className={
              lowStock ? 'flex items-center gap-1 text-amber-600 dark:text-amber-400' : ''
            }
          >
            {lowStock ? <IconAlertTriangle className="h-4 w-4" /> : null}
            {totalStock}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <IconDotsVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/dashboard/products/${row.original.id}/edit`}>Edit</Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setPendingDelete(row.original)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <DataTable
        OpenModal={() => router.push('/dashboard/products/new')}
        AddButtonText="Add Product"
        columns={columns}
        data={isLoading ? [] : products}
      />

      <Alert
        open={!!pendingDelete}
        setOpen={(b) => !b && setPendingDelete(null)}
        title="Delete product"
        description={
          pendingDelete
            ? `Are you sure you want to delete "${pendingDelete.name}"? Products that have been ordered are archived instead of deleted.`
            : ''
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={confirmDelete}
        isLoading={remove.isPending}
      />
    </>
  );
}
