'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { Card, CardContent } from '@/components/ui/card';
import { Loader } from '@/app/common/loader/loader';

import { useReviewableItems } from '@/modules/reviews/hooks';
import { WriteReviewForm } from '@/modules/reviews/components/write-review-form';

export default function ReviewableItemsPage() {
  const router = useRouter();
  const { status } = useSession();
  const items = useReviewableItems();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?callbackUrl=/account/reviews');
    }
  }, [status, router]);

  if (status !== 'authenticated' || items.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader />
      </div>
    );
  }

  const list = items.data ?? [];

  return (
    <div className="space-y-6 py-6">
      <h1 className="text-2xl font-semibold">Write a review</h1>

      {list.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            You don&apos;t have any delivered items waiting for review.{' '}
            <Link href="/account/orders" className="underline">
              View your orders
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {list.map((item) => (
            <li key={item.orderItemId}>
              <Card>
                <CardContent className="p-4 space-y-4">
                  <div className="flex gap-3">
                    <div className="relative w-16 h-16 bg-muted rounded overflow-hidden shrink-0">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" />
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/products/${item.productSlug}`}
                        className="font-medium hover:underline line-clamp-1"
                      >
                        {item.productName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {item.variantName ? `${item.variantName} · ` : ''}Order {item.orderNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Delivered {new Date(item.deliveredAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <WriteReviewForm orderItemId={item.orderItemId} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
