'use client';

import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { IconPlus, IconTrash } from '@tabler/icons-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import {
  AdminImageUploader,
  type UploadedImage,
} from '@/modules/admin/catalog/components/admin-image-uploader';
import {
  useAdminBrands,
  useAdminCategories,
  useAdminProductMutations,
} from '@/modules/admin/catalog/hooks';
import { productInputSchema, type ProductInput } from '@/contracts/catalog';
import type { AdminProduct } from '@/server/catalog/catalog.repo';
import { slugify } from '@/server/common/slug';

const PUBLISH_OPTIONS = [
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

interface ProductFormProps {
  /** When provided, the form opens in edit mode and pre-fills with this product. */
  product?: AdminProduct;
}

function emptyVariant(): ProductInput['variants'][number] {
  return {
    sku: '',
    name: '',
    attributes: {},
    buyingPriceCents: 0,
    sellingPriceCents: 0,
    discountCents: 0,
    stock: 0,
    lowStockThreshold: 5,
    isActive: true,
  };
}

function defaultsFromProduct(product?: AdminProduct): ProductInput {
  if (!product) {
    return {
      name: '',
      slug: '',
      description: '',
      brandId: '',
      categoryIds: [],
      status: 'DRAFT',
      isPopular: false,
      warrantyMonths: 0,
      metaTitle: null,
      metaDescription: null,
      images: [],
      variants: [emptyVariant()],
    };
  }
  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    brandId: product.brandId,
    categoryIds: product.categories.map((c) => c.categoryId),
    status: product.status,
    isPopular: product.isPopular,
    warrantyMonths: product.warrantyMonths,
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    images: product.images.map((img) => ({
      url: img.url,
      publicId: img.publicId,
      alt: img.alt,
      sortOrder: img.sortOrder,
    })),
    variants: product.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      name: v.name,
      attributes: (v.attributes as Record<string, string>) ?? {},
      buyingPriceCents: v.buyingPriceCents,
      sellingPriceCents: v.sellingPriceCents,
      discountCents: v.discountCents,
      stock: v.stock,
      lowStockThreshold: v.lowStockThreshold,
      isActive: v.isActive,
    })),
  };
}

export function ProductForm({ product }: ProductFormProps) {
  const router = useRouter();
  const { data: brands = [] } = useAdminBrands();
  const { data: categories = [] } = useAdminCategories();
  const { create, update } = useAdminProductMutations();

  const defaults = useMemo(() => defaultsFromProduct(product), [product]);
  const form = useForm<ProductInput>({
    resolver: zodResolver(productInputSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    form.reset(defaults);
  }, [defaults, form]);

  const variants = useFieldArray({ control: form.control, name: 'variants' });

  async function onSubmit(values: ProductInput) {
    try {
      if (product) {
        await update.mutateAsync({ id: product.id, input: values });
      } else {
        await create.mutateAsync(values);
      }
      router.push('/dashboard/products');
      router.refresh();
    } catch {
      // Toast already shown by mutation onError.
    }
  }

  const submitting = create.isPending || update.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">
            {product ? `Edit ${product.name}` : 'New product'}
          </h1>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {product ? 'Save changes' : 'Create product'}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="iPhone 15 Pro"
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
                    <Input {...field} />
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
              name="brandId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Pick a brand" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {brands.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
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
              name="warrantyMonths"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Warranty (months)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
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
              name="description"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={6} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="categoryIds"
              render={({ field }) => {
                const value = new Set(field.value);
                return (
                  <FormItem>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {categories.map((c) => {
                        const checked = value.has(c.id);
                        return (
                          <label
                            key={c.id}
                            className="flex items-center gap-2 rounded border px-3 py-2 cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => {
                                if (next) value.add(c.id);
                                else value.delete(c.id);
                                field.onChange(Array.from(value));
                              }}
                            />
                            <span className="text-sm">{c.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Images</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="images"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <AdminImageUploader
                      folder="products"
                      label=""
                      value={
                        (field.value ?? []).map((img) => ({
                          url: img.url,
                          publicId: img.publicId,
                          alt: img.alt ?? undefined,
                        })) as UploadedImage[]
                      }
                      onChange={(images) =>
                        field.onChange(
                          images.map((img, idx) => ({
                            url: img.url,
                            publicId: img.publicId,
                            alt: img.alt ?? null,
                            sortOrder: idx,
                          })),
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Variants & inventory</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {variants.fields.map((variant, index) => (
              <div key={variant.id} className="rounded border p-4 space-y-4 relative">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Variant #{index + 1}</h3>
                  {variants.fields.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => variants.remove(index)}
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name={`variants.${index}.sku`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SKU</FormLabel>
                        <FormControl>
                          <Input placeholder="APL-IP15P-256" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`variants.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name (e.g. 256GB Black)</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Default"
                            {...field}
                            value={field.value ?? ''}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`variants.${index}.isActive`}
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormLabel className="m-0">Active</FormLabel>
                        <FormControl>
                          <Switch
                            checked={!!field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <FormField
                    control={form.control}
                    name={`variants.${index}.buyingPriceCents`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Buying price (cents)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`variants.${index}.sellingPriceCents`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Selling price (cents)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`variants.${index}.discountCents`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount (cents)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`variants.${index}.lowStockThreshold`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Low-stock alert</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name={`variants.${index}.stock`}
                  render={({ field }) => (
                    <FormItem className="md:max-w-xs">
                      <FormLabel>Stock</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => variants.append(emptyVariant())}
            >
              <IconPlus className="mr-2 h-4 w-4" />
              Add variant
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SEO</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="metaTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meta title</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="metaDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Meta description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}
