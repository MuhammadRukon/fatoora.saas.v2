'use client';

import Image from 'next/image';
import { useState } from 'react';

interface ProductDetailGalleryProps {
  productName: string;
  images: { url: string; alt: string | null }[];
}

export function ProductDetailGallery({ productName, images }: ProductDetailGalleryProps) {
  const [activeImage, setActiveImage] = useState(0);

  return (
    <>
      <div className="relative aspect-square bg-muted rounded overflow-hidden">
        {images[activeImage] ? (
          <Image
            src={images[activeImage].url}
            alt={images[activeImage].alt ?? productName}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            No image
          </div>
        )}
      </div>
      {images.length > 1 ? (
        <div className="grid grid-cols-5 gap-2 mt-3">
          {images.map((img, idx) => (
            <button
              key={img.url}
              type="button"
              onClick={() => setActiveImage(idx)}
              className={`relative aspect-square rounded overflow-hidden border ${
                activeImage === idx ? 'border-primary' : 'border-transparent'
              }`}
            >
              <Image src={img.url} alt={img.alt ?? ''} fill className="object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
