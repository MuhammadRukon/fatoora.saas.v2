'use client';

import { use } from 'react';
import { ProductForm } from '@/modules/admin/catalog/components/product-form';
import { useAdminProduct } from '@/modules/admin/catalog/hooks';
import { Loader } from '@/app/common/loader/loader';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function EditProductPage({ params }: PageProps) {
  const { id } = use(params);
  const { data: product, isLoading } = useAdminProduct(id);

  if (isLoading || !product) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }
  return <ProductForm product={product} />;
}
