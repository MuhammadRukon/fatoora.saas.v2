import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Image from 'next/image';
import React from 'react';
import { FieldValues } from 'react-hook-form';

interface SelectAtomProps {
  placeholder?: string;
  field: FieldValues;
  type?: 'default' | 'icon';
  options: { value: string; label: string }[];
}

export function SelectAtom({
  field,
  options,
  placeholder = '',
  type = 'default',
}: SelectAtomProps) {
  return (
    <Select value={field.value} onValueChange={field.onChange}>
      <SelectTrigger className=" w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => {
          if (type === 'icon') {
            return (
              <SelectItem
                key={option.value}
                value={option.value}
                className="flex items-center gap-2"
              >
                <Image
                  width={100}
                  height={100}
                  quality={100}
                  className="w-8 h-8"
                  src={option.value}
                  alt={option.label}
                  key={option.value}
                />
                {option.label}
              </SelectItem>
            );
          }

          return (
            <SelectItem className="w-full" key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
