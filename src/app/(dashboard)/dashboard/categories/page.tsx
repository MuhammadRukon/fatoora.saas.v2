'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { IconDotsVertical } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge';
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
  useAdminCategories,
  useAdminCategoryMutations,
} from '@/modules/admin/catalog/hooks';
import {
  categoryInputSchema,
  type Category,
  type CategoryInput,
} from '@/contracts/catalog';
import { slugify } from '@/server/common/slug';

const PUBLISH_OPTIONS = [
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

const defaultValues: CategoryInput = {
  name: '',
  slug: '',
  iconUrl: null,
  parentId: null,
  isPopular: false,
  status: 'PUBLISHED',
};

const NO_PARENT = '__none__';

export default function AdminCategoriesPage() {
  const { data: categories = [], isLoading } = useAdminCategories();
  const { create, update, remove } = useAdminCategoryMutations();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  const form = useForm<CategoryInput>({
    resolver: zodResolver(categoryInputSchema),
    defaultValues,
  });

  function openCreate() {
    setEditing(null);
    form.reset(defaultValues);
    setOpen(true);
  }
  function openEdit(category: Category) {
    setEditing(category);
    form.reset({
      name: category.name,
      slug: category.slug,
      iconUrl: category.iconUrl,
      parentId: category.parentId,
      isPopular: category.isPopular,
      status: category.status,
    });
    setOpen(true);
  }

  async function onSubmit(values: CategoryInput) {
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

  const columns: ColumnDef<Category>[] = [
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
      accessorKey: 'parentId',
      header: 'Parent',
      cell: ({ row }) => {
        const parent = categories.find((c) => c.id === row.original.parentId);
        return parent ? parent.name : <span className="text-muted-foreground">—</span>;
      },
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
        AddButtonText="Add Category"
        columns={columns}
        data={isLoading ? [] : categories}
      />

      <Modal
        title={editing ? 'Edit Category' : 'Add Category'}
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
                  <FormLabel>Category Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Phones"
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
              name="parentId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Parent Category</FormLabel>
                  <Select
                    value={field.value ?? NO_PARENT}
                    onValueChange={(v) => field.onChange(v === NO_PARENT ? null : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_PARENT}>None</SelectItem>
                      {categories
                        .filter((c) => c.id !== editing?.id)
                        .map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
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
              name="iconUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Icon</FormLabel>
                  <FormControl>
                    <AdminImageUploader
                      single
                      folder="categories"
                      value={
                        field.value
                          ? [{ url: field.value, publicId: field.value }]
                          : ([] as UploadedImage[])
                      }
                      onChange={(images) => field.onChange(images[0]?.url ?? null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={create.isPending || update.isPending}>
              {editing ? 'Save changes' : 'Create category'}
            </Button>
          </form>
        </Form>
      </Modal>

      <Alert
        open={!!pendingDelete}
        setOpen={(b) => !b && setPendingDelete(null)}
        title="Delete category"
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
