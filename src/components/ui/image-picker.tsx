'use client';

import { useState, useRef } from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { IconX } from '@tabler/icons-react';

interface ImageUploadProps {
  value?: string[];
  onChange: (value: string[]) => void;
  onFileChange?: (files: File[] | null) => void;
  label?: string;
  maxSize?: number; // MB
  disabled?: boolean;
  single?: boolean;
}

export function ImagePicker({
  value,
  onChange,
  onFileChange,
  label = 'Image',
  maxSize = 1,
  disabled = false,
  single = false,
}: ImageUploadProps) {
  const [previews, setPreviews] = useState<string[]>(value || []);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newPreviews: string[] = [];
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.size > maxSize * 1024 * 1024) {
        setError(`Max ${maxSize}MB per file`);
        continue;
      }
      if (!file.type.startsWith('image/')) {
        setError('Invalid image type');
        continue;
      }

      setError(null);
      newPreviews.push(URL.createObjectURL(file));
      validFiles.push(file);
    }

    if (single) {
      setPreviews(newPreviews.slice(0, 1));
      onChange(newPreviews.slice(0, 1));
      onFileChange?.(validFiles.slice(0, 1) || null);
    } else {
      setPreviews((prev) => [...prev, ...newPreviews]);
      onChange([...previews, ...newPreviews]);
      onFileChange?.([...validFiles]);
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    const updated = previews.filter((_, i) => i !== index);
    setPreviews(updated);
    onChange(updated);
    onFileChange?.(null);
  };

  return (
    <div className="space-y-2">
      {label && <Label className="text-sm font-medium">{label}</Label>}

      <div className="flex flex-wrap gap-2">
        {previews.map((url, idx) => (
          <div
            key={idx}
            className="relative w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer"
            onClick={() => !disabled && inputRef.current?.click()}
          >
            <Image src={url} alt={`Preview ${idx}`} fill className="object-cover" />
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="absolute -top-2 -right-2 z-20 h-6 w-6 rounded-full p-0 cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                removeImage(idx);
              }}
              disabled={disabled}
            >
              <IconX className="h-3 w-3" />
            </Button>
          </div>
        ))}

        {(!single || previews.length === 0) && (
          <div
            className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer"
            onClick={() => !disabled && inputRef.current?.click()}
          >
            <p className="text-gray-400 text-xs text-center">Click to upload</p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept="image/*"
        multiple={!single}
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}
