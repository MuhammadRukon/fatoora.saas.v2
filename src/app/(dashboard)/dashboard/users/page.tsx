'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ColumnDef } from '@tanstack/react-table';
import { UserRole } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import Image from 'next/image';

import { DataTable } from '@/components/data-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconDotsVertical } from '@tabler/icons-react';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Modal } from '@/app/components/modal/modal';
import { useAdminUserMutations, useAdminUsers } from '@/modules/admin/catalog/hooks';
import {
  adminUserCreateSchema,
  type AdminUserCreateInput,
  type AdminUserUpdateInput,
} from '@/contracts/admin-users';
import { AdminUser } from '@/server/catalog/catalog.repo';

const ROLE_OPTIONS: Array<{ value: UserRole; label: string }> = [
  { value: UserRole.ADMIN, label: 'Admin' },
  { value: UserRole.CUSTOMER, label: 'Customer' },
];

const defaultValues: AdminUserCreateInput = {
  name: '',
  email: '',
  phone: '',
  image: '',
  role: UserRole.CUSTOMER,
  password: '',
};

export default function AdminUsersPage() {
  const { data: users = [], isLoading } = useAdminUsers();
  const { create, update } = useAdminUserMutations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);

  const form = useForm<AdminUserCreateInput>({
    resolver: zodResolver(adminUserCreateSchema),
    defaultValues,
  });

  function openCreate() {
    setEditing(null);
    form.reset(defaultValues);
    setOpen(true);
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    form.reset({
      name: user.name || '',
      email: user.email,
      phone: user.phone || '',
      image: user.image || '',
      role: user.role,
      password: '',
    });
    setOpen(true);
  }

  async function onSubmit(values: AdminUserCreateInput) {
    try {
      if (editing) {
        const payload: AdminUserUpdateInput = {
          name: values.name,
          phone: values.phone || null,
          image: values.image || null,
          role: values.role,
        };
        await update.mutateAsync({ id: editing.id, input: payload });
      } else {
        await create.mutateAsync({
          ...values,
          phone: values.phone || null,
          image: values.image || null,
          password: values.password || undefined,
        });
      }
      setOpen(false);
      setEditing(null);
      form.reset(defaultValues);
    } catch {
      // toast handled in hook
    }
  }

  const columns: ColumnDef<AdminUser>[] = [
    {
      accessorKey: 'image',
      header: 'Avatar',
      cell: ({ row }) => (
        row.original.image ? (
          <Image
            src={row.original.image}
            alt={row.original.name || row.original.email}
            width={36}
            height={36}
            className="size-9 rounded-full object-cover"
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full text-xs">
            {(row.original.name || row.original.email).charAt(0).toUpperCase()}
          </div>
        )
      ),
    },
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.name || 'N/A'}</span>
          <span className="text-muted-foreground text-xs">{row.original.email}</span>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => <Badge variant="outline">{row.original.role}</Badge>,
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => row.original.phone || 'N/A',
    },
    {
      accessorKey: 'emailVerified',
      header: 'Verified',
      cell: ({ row }) => (row.original.emailVerified ? 'Yes' : 'No'),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <IconDotsVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(row.original)}>Edit</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <DataTable
        OpenModal={openCreate}
        AddButtonText="Add User"
        columns={columns}
        data={isLoading ? [] : users}
      />
      <Modal
        title={editing ? 'Edit User' : 'Add User'}
        isOpen={open}
        onChange={(isOpen) => {
          if (!isOpen) {
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
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="John Doe" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="john@example.com" readOnly={!!editing} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="+8801XXXXXXXXX"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Avatar URL</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      placeholder="https://example.com/avatar.jpg"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ROLE_OPTIONS.map((role) => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!editing ? (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password (optional)</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        placeholder="Minimum 8 characters"
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            <Button type="submit" disabled={create.isPending || update.isPending}>
              {editing ? 'Save Changes' : 'Create User'}
            </Button>
          </form>
        </Form>
      </Modal>
    </>
  );
}
