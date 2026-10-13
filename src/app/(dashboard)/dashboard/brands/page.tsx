'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { IconDotsVertical } from '@tabler/icons-react';
import Image from 'next/image';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { DataTable } from '@/components/data-table';
import { Modal } from '@/app/components/modal/modal';
import { Alert } from '@/app/components/alert/alert';
import {
  AdminImageUploader,
  type UploadedImage,
} from '@/modules/admin/catalog/components/admin-image-uploader';
import {
  useAdminBrandMutations,
  useAdminBrands,
} from '@/modules/admin/catalog/hooks';
import { brandInputSchema, type Brand, type BrandInput } from '@/contracts/catalog';
import { slugify } from '@/server/common/slug';

const PUBLISH_OPTIONS = [
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

const defaultValues: BrandInput = {
  name: '',
  slug: '',
  logoUrl: null,
  isPopular: false,
  status: 'PUBLISHED',
};

export default function AdminBrandsPage() {
  const { data: brands = [], isLoading } = useAdminBrands();
  const { create, update, remove } = useAdminBrandMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Brand | null>(null);

  const form = useForm<BrandInput>({
    resolver: zodResolver(brandInputSchema),
    defaultValues,
  });

  function openCreate() {
    setEditing(null);
    form.reset(defaultValues);
    setOpen(true);
  }
  function openEdit(brand: Brand) {
    setEditing(brand);
    form.reset({
      name: brand.name,
      slug: brand.slug,
      logoUrl: brand.logoUrl,
      isPopular: brand.isPopular,
      status: brand.status,
    });
    setOpen(true);
  }

  async function onSubmit(values: BrandInput) {
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, input: values });
      } else {
        await create.mutateAsync(values);
      }
      setOpen(false);
      setEditing(null);
      form.reset(defaultValues);
    } catch {
      // Toast already shown by mutation onError.
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await remove.mutateAsync(pendingDelete.id);
    } finally {
      setPendingDelete(null);
    }
  }

  const columns: ColumnDef<Brand>[] = [
    {
      accessorKey: 'logoUrl',
      header: 'Logo',
      cell: ({ row }) =>
        row.original.logoUrl ? (
          <div className="w-10 h-10 relative rounded overflow-hidden bg-muted">
            <Image src={row.original.logoUrl} alt={row.original.name} fill className="object-contain" />
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">No logo</span>
        ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.name}</span>
          <span className="text-muted-foreground text-xs">{row.original.slug}</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
    },
    {
      accessorKey: 'isPopular',
      header: 'Popular',
      cell: ({ row }) => (row.original.isPopular ? 'Yes' : 'No'),
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
            <DropdownMenuItem onClick={() => openEdit(row.original)}>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setPendingDelete(row.original)}>
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
        OpenModal={openCreate}
        AddButtonText="Add Brand"
        columns={columns}
        data={isLoading ? [] : brands}
      />

      <Modal
        title={editing ? 'Edit Brand' : 'Add Brand'}
        isOpen={open}
        onChange={(b) => {
          if (!b) {
            setOpen(false);
            setEditing(null);
          }
        }}
      >
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Apple"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        form.setValue('slug', slugify(e.target.value));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input {...field} readOnly />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {PUBLISH_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="isPopular"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0">
                  <FormLabel className="m-0">Popular</FormLabel>
                  <FormControl>
                    <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Logo</FormLabel>
                  <FormControl>
                    <AdminImageUploader
                      single
                      folder="brands"
                      value={
                        field.value ? [{ url: field.value, publicId: field.value }] : ([] as UploadedImage[])
                      }
                      onChange={(images) => field.onChange(images[0]?.url ?? null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={create.isPending || update.isPending}>
              {editing ? 'Save changes' : 'Create brand'}
            </Button>
          </form>
        </Form>
      </Modal>

      <Alert
        open={!!pendingDelete}
        setOpen={(b) => !b && setPendingDelete(null)}
        title="Delete brand"
        description={
          pendingDelete
            ? `Are you sure you want to delete "${pendingDelete.name}"?`
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
