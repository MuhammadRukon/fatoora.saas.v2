'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { IconX } from '@tabler/icons-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ApiClientError } from '@/lib/fetcher';

export interface UploadedImage {
  url: string;
  publicId: string;
  alt?: string;
}

interface AdminImageUploaderProps {
  value: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  label?: string;
  single?: boolean;
  disabled?: boolean;
  folder?: string;
  /**
   * When true, removing an image only calls `onChange`; the remote asset is
   * NOT deleted here. Use it when the owner of the form deletes the old asset
   * server-side on save (so an unsaved removal never orphans the saved record).
   * Defaults to false: remove immediately, as the catalog forms expect.
   */
  deferDelete?: boolean;
}

/**
 * Calls the admin-only upload endpoint and tracks the Cloudinary
 * `publicId` for each asset so deletes are unambiguous. Removing an
 * image both updates local state and asks the server to drop the
 * remote asset (unless `deferDelete` is set).
 */
export function AdminImageUploader({
  value,
  onChange,
  label = 'Images',
  single = false,
  disabled = false,
  folder = 'catalog',
  deferDelete = false,
}: AdminImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    const uploaded: UploadedImage[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('folder', folder);
        const res = await fetch('/api/admin/media/upload', { method: 'POST', body: fd });
        if (!res.ok) {
          const err = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(err?.message ?? `Upload failed (${res.status})`);
        }
        const data = (await res.json()) as UploadedImage;
        uploaded.push({ url: data.url, publicId: data.publicId });
        if (single) break;
      }
      onChange(single ? uploaded.slice(0, 1) : [...value, ...uploaded]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeAt(index: number) {
    const target = value[index];
    onChange(value.filter((_, i) => i !== index));
    if (deferDelete) return;
    try {
      await fetch('/api/admin/media/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicId: target.publicId }),
      });
    } catch (err) {
      // Best-effort cleanup. The local state has already been updated;
      // a stale Cloudinary asset is preferable to blocking the user.
      if (err instanceof ApiClientError) {
        toast.message('Failed to remove the remote image; it has been detached locally.');
      }
    }
  }

  const slotsAvailable = !single || value.length === 0;

  return (
    <div className="space-y-2">
      {label ? <Label className="text-sm font-medium">{label}</Label> : null}
      <div className="flex flex-wrap gap-2">
        {value.map((img, idx) => (
          <div
            key={img.publicId + idx}
            className="relative w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg overflow-hidden"
          >
            <Image src={img.url} alt={img.alt ?? `Image ${idx + 1}`} fill className="object-cover" />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute -top-2 -right-2 z-20 h-6 w-6 rounded-full p-0"
              onClick={() => removeAt(idx)}
              disabled={disabled || busy}
            >
              <IconX className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {slotsAvailable ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
            className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer text-xs text-muted-foreground"
          >
            {busy ? 'Uploading...' : 'Click to upload'}
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*"
        multiple={!single}
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled || busy}
      />
    </div>
  );
}
